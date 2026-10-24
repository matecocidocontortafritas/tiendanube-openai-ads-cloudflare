import { decryptSecret, sha256Hex } from "./crypto";
import { secretBinding, type Env, type QueueMessage } from "./env";
import {
  buildOrderCreatedEvent,
  attributionFromOrder,
  PermanentEventError,
  type Attribution,
  type OpenAIEvent,
  type TiendanubeOrder,
} from "./openai";

type Store = {
  store_id: string;
  client_key: string;
  source_url: string;
  pixel_secret_slot: string;
  capi_secret_slot: string;
  validate_only: number;
  enabled: number;
};

type Delivery = { state: string; attempt_count: number; validate_only: number };

class IntegrationError extends Error {
  constructor(
    public readonly code: string,
    public readonly integration: "tiendanube" | "openai" | "worker",
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds = 60,
  ) {
    super(code);
    this.name = "IntegrationError";
  }
}

export async function processQueueMessage(
  message: Message<QueueMessage>,
  env: Env,
): Promise<void> {
  const body = message.body;
  if (body.kind !== "tiendanube_webhook" || body.event !== "order/paid") {
    console.error(JSON.stringify({ level: "error", event: "unsupported_queue_message" }));
    message.ack();
    return;
  }

  const eventId = `tn_order_${body.resourceId}`;
  let attempt = 1;
  let integration: IntegrationError["integration"] = "worker";
  const startedAt = Date.now();

  try {
    const store = await loadStore(body.storeId, env);
    if (!store || store.enabled !== 1) {
      await markReceipt(body.receiptKey, "ignored", env);
      message.ack();
      return;
    }

    const existing = await env.DB.prepare(
      "SELECT state, attempt_count, validate_only FROM deliveries WHERE event_id = ? LIMIT 1",
    )
      .bind(eventId)
      .first<Delivery>();
    attempt = (existing?.attempt_count ?? 0) + 1;
    if (existing?.state === "delivered" || (existing?.state === "validated" && store.validate_only === 1)) {
      await markReceipt(body.receiptKey, "completed", env);
      message.ack();
      return;
    }

    await env.DB.prepare(
      `INSERT INTO deliveries (event_id, store_id, order_id, event_type, validate_only, state)
       VALUES (?, ?, ?, 'order_created', ?, 'pending')
       ON CONFLICT(event_id) DO UPDATE SET
         validate_only = excluded.validate_only,
         state = CASE WHEN deliveries.state = 'validated' AND excluded.validate_only = 0 THEN 'pending' ELSE deliveries.state END,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(eventId, body.storeId, body.resourceId, store.validate_only)
      .run();
    const credentials = resolveOpenAICredentials(store, env);
    await env.DB.prepare(
      `UPDATE webhook_receipts SET status = 'processing', processing_started_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = ?`,
    )
      .bind(body.receiptKey)
      .run();

    integration = "tiendanube";
    const accessToken = await loadTiendanubeToken(body.storeId, env);
    const order = await fetchOrder(body.storeId, body.resourceId, accessToken, env);
    if (order.payment_status !== "paid") {
      await env.DB.prepare(
        `UPDATE deliveries SET state = 'permanent_failure', last_error_code = 'order_not_paid',
          updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`,
      ).bind(eventId).run();
      await markReceipt(body.receiptKey, "ignored", env);
      await recordAttempt(eventId, attempt, "tiendanube", "permanent_error", undefined, "order_not_paid", Date.now() - startedAt, env);
      message.ack();
      return;
    }

    const storedAttribution = await loadAttribution(body.storeId, body.resourceId, env);
    const orderAttribution = attributionFromOrder(order);
    const attribution: Attribution = {
      oppref: storedAttribution.oppref ?? orderAttribution.oppref,
      obref: storedAttribution.obref ?? orderAttribution.obref,
      sourceUrl: storedAttribution.sourceUrl ?? orderAttribution.sourceUrl,
    };
    const event = await buildOrderCreatedEvent(order, store.source_url, attribution);
    const payload = {
      validate_only: store.validate_only === 1,
      integration_source: env.INTEGRATION_SOURCE || "tiendanube_cloudflare_worker",
      events: [event],
    };
    const payloadHash = await sha256Hex(JSON.stringify(payload));

    integration = "openai";
    await env.DB.prepare(
      `UPDATE deliveries SET state = ?, attempt_count = ?, payload_sha256 = ?,
        last_attempt_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE event_id = ?`,
    )
      .bind(store.validate_only === 1 ? "validating" : "sending", attempt, payloadHash, eventId)
      .run();
    const status = await sendOpenAIEvent(credentials.pixelId, credentials.capiKey, payload);

    await env.DB.prepare(
      `UPDATE deliveries SET state = ?, last_http_status = ?, last_error_code = NULL,
        accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`,
    )
      .bind(store.validate_only === 1 ? "validated" : "delivered", status, eventId)
      .run();
    await recordAttempt(eventId, attempt, "openai", "success", status, undefined, Date.now() - startedAt, env);
    await markReceipt(body.receiptKey, "completed", env);
    console.log(JSON.stringify({
      level: "info",
      event: store.validate_only === 1 ? "openai_event_validated" : "openai_event_delivered",
      store_id: body.storeId,
      event_id: eventId,
      http_status: status,
    }));
    message.ack();
  } catch (error) {
    const classified = classifyError(error, integration);
    await env.DB.prepare(
      `UPDATE deliveries SET state = ?, attempt_count = ?, last_http_status = ?, last_error_code = ?,
        last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`,
    )
      .bind(
        classified.retryable ? "retrying" : "permanent_failure",
        attempt,
        classified.httpStatus ?? null,
        classified.code,
        eventId,
      )
      .run();
    await recordAttempt(
      eventId,
      attempt,
      classified.integration === "worker" ? integration : classified.integration,
      classified.retryable ? "retryable_error" : "permanent_error",
      classified.httpStatus,
      classified.code,
      Date.now() - startedAt,
      env,
    );

    console.error(JSON.stringify({
      level: "error",
      event: "conversion_processing_failed",
      store_id: body.storeId,
      event_id: eventId,
      integration: classified.integration,
      error_code: classified.code,
      http_status: classified.httpStatus,
      retryable: classified.retryable,
      attempt,
    }));
    if (classified.retryable) {
      message.retry({ delaySeconds: classified.retryAfterSeconds });
    } else {
      await markReceipt(body.receiptKey, "failed", env);
      message.ack();
    }
  }
}

async function loadStore(storeId: string, env: Env): Promise<Store | null> {
  return env.DB.prepare(
    `SELECT store_id, client_key, source_url, pixel_secret_slot, capi_secret_slot,
      validate_only, enabled FROM stores WHERE store_id = ? LIMIT 1`,
  ).bind(storeId).first<Store>();
}

function resolveOpenAICredentials(store: Store, env: Env): { pixelId: string; capiKey: string } {
  const pixelId = secretBinding(env, store.pixel_secret_slot, "OPENAI_PIXEL_ID_");
  const capiKey = secretBinding(env, store.capi_secret_slot, "OPENAI_CAPI_KEY_");
  if (!pixelId || !capiKey) throw new IntegrationError("client_secrets_missing", "worker", false);
  return { pixelId, capiKey };
}

async function loadTiendanubeToken(storeId: string, env: Env): Promise<string> {
  if (!env.CREDENTIALS_ENCRYPTION_KEY) {
    throw new IntegrationError("credentials_encryption_key_missing", "worker", false);
  }
  const installation = await env.DB.prepare(
    `SELECT app_id, access_token_ciphertext, access_token_iv, status
     FROM app_installations WHERE store_id = ? LIMIT 1`,
  ).bind(storeId).first<{
    app_id: string;
    access_token_ciphertext: string;
    access_token_iv: string;
    status: string;
  }>();
  if (!installation || installation.status !== "active") {
    throw new IntegrationError("tiendanube_installation_inactive", "worker", false);
  }
  try {
    return await decryptSecret(
      installation.access_token_ciphertext,
      installation.access_token_iv,
      env.CREDENTIALS_ENCRYPTION_KEY,
      `tiendanube:${installation.app_id}:${storeId}`,
    );
  } catch {
    throw new IntegrationError("tiendanube_token_decryption_failed", "worker", false);
  }
}

async function fetchOrder(
  storeId: string,
  orderId: string,
  accessToken: string,
  env: Env,
): Promise<TiendanubeOrder> {
  let response: Response;
  try {
    response = await fetch(`https://api.tiendanube.com/2025-03/${storeId}/orders/${orderId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new IntegrationError("tiendanube_network_error", "tiendanube", true);
  }
  if (!response.ok) {
    throw new IntegrationError(
      `tiendanube_http_${response.status}`,
      "tiendanube",
      response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      response.status,
      retryAfter(response),
    );
  }
  try {
    return (await response.json()) as TiendanubeOrder;
  } catch {
    throw new IntegrationError("tiendanube_invalid_json", "tiendanube", true);
  }
}

async function loadAttribution(storeId: string, orderId: string, env: Env): Promise<Attribution> {
  const row = await env.DB.prepare(
    `SELECT oppref, obref, source_url FROM order_attribution
     WHERE store_id = ? AND order_id = ? AND expires_at >= CURRENT_TIMESTAMP LIMIT 1`,
  ).bind(storeId, orderId).first<{ oppref: string | null; obref: string | null; source_url: string | null }>();
  return row ? { oppref: row.oppref, obref: row.obref, sourceUrl: row.source_url } : {};
}

async function sendOpenAIEvent(
  pixelId: string,
  capiKey: string,
  payload: { validate_only: boolean; integration_source: string; events: OpenAIEvent[] },
): Promise<number> {
  const endpoint = new URL("https://bzr.openai.com/v1/events");
  endpoint.searchParams.set("pid", pixelId);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${capiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new IntegrationError("openai_network_error", "openai", true);
  }
  if (!response.ok) {
    let code = `openai_http_${response.status}`;
    try {
      const body = await response.json() as { error?: { code?: string } | string; code?: string };
      const candidate = typeof body.error === "object" ? body.error?.code : body.code;
      if (candidate && /^[a-zA-Z0-9_.-]{1,80}$/.test(candidate)) code = `openai_${candidate}`;
    } catch {
      // Response bodies can contain request details; never log them.
    }
    throw new IntegrationError(
      code,
      "openai",
      response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      response.status,
      retryAfter(response),
    );
  }
  return response.status;
}

function classifyError(error: unknown, fallback: IntegrationError["integration"]): IntegrationError {
  if (error instanceof IntegrationError) return error;
  if (error instanceof PermanentEventError) return new IntegrationError(error.code, fallback, false);
  return new IntegrationError("unexpected_processing_error", fallback, true);
}

function retryAfter(response: Response): number {
  const raw = response.headers.get("retry-after");
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 86_400 ? Math.ceil(seconds) : 60;
}

async function recordAttempt(
  eventId: string,
  attempt: number,
  integration: "tiendanube" | "openai" | "worker",
  outcome: "success" | "retryable_error" | "permanent_error",
  httpStatus: number | undefined,
  code: string | undefined,
  durationMs: number,
  env: Env,
): Promise<void> {
  // The original schema predates worker-local failures; store those under the
  // integration active at the time without logging payloads or personal data.
  const schemaIntegration = integration === "worker" ? "tiendanube" : integration;
  await env.DB.prepare(
    `INSERT INTO delivery_attempts
      (event_id, attempt_number, integration, outcome, http_status, error_code, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(eventId, attempt, schemaIntegration, outcome, httpStatus ?? null, code ?? null, durationMs).run();
}

async function markReceipt(
  receiptKey: string,
  status: "completed" | "ignored" | "failed",
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE webhook_receipts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?",
  ).bind(status, receiptKey).run();
}

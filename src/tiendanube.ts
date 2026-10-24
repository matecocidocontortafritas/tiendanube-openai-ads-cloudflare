import { decryptSecret, encryptSecret, sha256Hex, verifyTiendanubeHmac } from "./crypto";
import type { Env, QueueMessage } from "./env";
import { json, methodNotAllowed, redirect } from "./http";

const STATE_COOKIE = "tn_oauth_state";

type TokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  user_id: number | string;
};

type WebhookPayload = {
  store_id?: number | string;
  event?: string;
  id?: number | string;
  orders_to_redact?: Array<number | string>;
  orders_requested?: Array<number | string>;
  data_request?: { id?: number | string };
};

export async function beginInstallation(env: Env): Promise<Response> {
  const state = randomToken(32);
  const stateHash = await sha256Hex(state);
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, expires_at) VALUES (?, ?)",
  )
    .bind(stateHash, now + 600)
    .run();

  const authorize = new URL(`https://www.tiendanube.com/apps/${env.TIENDANUBE_APP_ID}/authorize`);
  authorize.searchParams.set("state", state);

  return redirect(authorize.toString(), {
    "set-cookie": `${STATE_COOKIE}=${state}; Path=/tiendanube/oauth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  });
}

export async function completeInstallation(request: Request, env: Env): Promise<Response> {
  if (!env.TIENDANUBE_APP_SECRET || !env.CREDENTIALS_ENCRYPTION_KEY) {
    return json({ error: "installation_not_configured" }, 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(request.headers.get("cookie"), STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    return json({ error: "invalid_oauth_callback" }, 400);
  }

  const stateHash = await sha256Hex(state);
  const now = Math.floor(Date.now() / 1000);
  const consumed = await env.DB.prepare(
    `UPDATE oauth_states
       SET used_at = ?
     WHERE state_hash = ? AND used_at IS NULL AND expires_at >= ?`,
  )
    .bind(now, stateHash, now)
    .run();

  if ((consumed.meta.changes ?? 0) !== 1) {
    return json({ error: "invalid_or_expired_oauth_state" }, 400);
  }

  const token = await exchangeAuthorizationCode(code, env);
  const storeId = String(token.user_id);
  const encrypted = await encryptSecret(
    token.access_token,
    env.CREDENTIALS_ENCRYPTION_KEY,
    `tiendanube:${env.TIENDANUBE_APP_ID}:${storeId}`,
  );

  await env.DB.prepare(
    `INSERT INTO app_installations (
       store_id, app_id, access_token_ciphertext, access_token_iv, granted_scopes, status
     ) VALUES (?, ?, ?, ?, ?, 'active')
     ON CONFLICT(store_id) DO UPDATE SET
       app_id = excluded.app_id,
       access_token_ciphertext = excluded.access_token_ciphertext,
       access_token_iv = excluded.access_token_iv,
       granted_scopes = excluded.granted_scopes,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      storeId,
      env.TIENDANUBE_APP_ID,
      encrypted.ciphertext,
      encrypted.iv,
      token.scope,
    )
    .run();

  await ensureWebhook(
    storeId,
    token.access_token,
    "order/paid",
    `${env.PUBLIC_BASE_URL}/webhooks/tiendanube/order-paid`,
    env,
  );

  if (env.TIENDANUBE_STOREFRONT_SCRIPT_ID) {
    await ensureStorefrontScriptAssociation(storeId, token.access_token, env);
  }

  console.log(
    JSON.stringify({ level: "info", event: "tiendanube_installation_completed", store_id: storeId }),
  );

  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Open AI CAPI instalada</title><body><main><h1>Instalación completada</h1><p>La tienda quedó conectada. Ya podés cerrar esta ventana.</p></main></body></html>`,
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "set-cookie": `${STATE_COOKIE}=; Path=/tiendanube/oauth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function associateInstalledStoreWithScript(
  storeId: string,
  env: Env,
): Promise<"created" | "refreshed"> {
  if (!/^\d+$/.test(storeId)) throw new Error("invalid_store_id");
  if (!env.TIENDANUBE_STOREFRONT_SCRIPT_ID) {
    throw new Error("tiendanube_storefront_script_not_configured");
  }
  const accessToken = await loadInstalledAccessToken(storeId, env);
  return ensureStorefrontScriptAssociation(storeId, accessToken, env);
}

export async function getInstalledStorefrontScriptStatus(
  storeId: string,
  env: Env,
): Promise<{
  id: number;
  status: string | null;
  event: string | null;
  location: string | null;
  is_auto_install: boolean | null;
  current_version: number | null;
  has_draft_version: boolean;
}> {
  if (!/^\d+$/.test(storeId)) throw new Error("invalid_store_id");
  const scriptId = env.TIENDANUBE_STOREFRONT_SCRIPT_ID;
  if (!scriptId || !/^\d+$/.test(scriptId)) {
    throw new Error("invalid_tiendanube_storefront_script_id");
  }
  const accessToken = await loadInstalledAccessToken(storeId, env);
  const response = await fetch(
    `https://api.tiendanube.com/2025-03/${storeId}/scripts/${scriptId}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`tiendanube_script_status_http_${response.status}`);
  const body = await response.json() as {
    id?: number;
    status?: string;
    event?: string;
    location?: string;
    is_auto_install?: boolean;
    current_version?: { version?: number } | null;
    draft_version?: unknown;
  };
  if (body.id !== Number(scriptId)) throw new Error("tiendanube_script_status_mismatch");
  return {
    id: body.id,
    status: body.status ?? null,
    event: body.event ?? null,
    location: body.location ?? null,
    is_auto_install: typeof body.is_auto_install === "boolean" ? body.is_auto_install : null,
    current_version: body.current_version?.version ?? null,
    has_draft_version: body.draft_version != null,
  };
}

async function loadInstalledAccessToken(storeId: string, env: Env): Promise<string> {
  if (!env.CREDENTIALS_ENCRYPTION_KEY) {
    throw new Error("credentials_encryption_key_missing");
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
    throw new Error("tiendanube_installation_inactive");
  }
  return decryptSecret(
    installation.access_token_ciphertext,
    installation.access_token_iv,
    env.CREDENTIALS_ENCRYPTION_KEY,
    `tiendanube:${installation.app_id}:${storeId}`,
  );
}

export async function receiveOrderPaidWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!env.TIENDANUBE_APP_SECRET) return json({ error: "webhook_not_configured" }, 503);

  const rawBody = await request.text();
  if (rawBody.length > 32_768) return json({ error: "payload_too_large" }, 413);

  const validSignature = await verifyTiendanubeHmac(
    rawBody,
    request.headers.get("x-linkedstore-hmac-sha256"),
    env.TIENDANUBE_APP_SECRET,
  );
  if (!validSignature) return json({ error: "invalid_signature" }, 401);

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (payload.event !== "order/paid" || payload.store_id == null || payload.id == null) {
    return json({ error: "invalid_webhook_payload" }, 400);
  }

  const storeId = String(payload.store_id);
  const resourceId = String(payload.id);
  if (!/^\d+$/.test(storeId) || !/^\d+$/.test(resourceId)) {
    return json({ error: "invalid_webhook_identifiers" }, 400);
  }

  const configured = await env.DB.prepare(
    "SELECT enabled FROM stores WHERE store_id = ? LIMIT 1",
  )
    .bind(storeId)
    .first<{ enabled: number }>();
  if (!configured) return json({ error: "unknown_store" }, 403);

  const receiptKey = await sha256Hex(`${storeId}:order/paid:${resourceId}`);
  const bodyHash = await sha256Hex(rawBody);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_receipts
       (idempotency_key, store_id, topic, resource_id, body_sha256)
     VALUES (?, ?, 'order/paid', ?, ?)`,
  )
    .bind(receiptKey, storeId, resourceId, bodyHash)
    .run();

  if ((inserted.meta.changes ?? 0) === 0) {
    return json({ accepted: true, duplicate: true }, 200);
  }

  if (configured.enabled !== 1) {
    await env.DB.prepare(
      "UPDATE webhook_receipts SET status = 'ignored', completed_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?",
    )
      .bind(receiptKey)
      .run();
    return json({ accepted: true, ignored: "store_disabled" }, 202);
  }

  const message: QueueMessage = {
    kind: "tiendanube_webhook",
    receiptKey,
    storeId,
    event: "order/paid",
    resourceId,
  };
  await env.EVENTS_QUEUE.send(message);
  return json({ accepted: true }, 202);
}

export async function receivePrivacyWebhook(
  request: Request,
  env: Env,
  expectedEvent: "store/redact" | "customers/redact" | "customers/data_request",
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!env.TIENDANUBE_APP_SECRET) return json({ error: "webhook_not_configured" }, 503);

  const rawBody = await request.text();
  if (rawBody.length > 32_768) return json({ error: "payload_too_large" }, 413);
  const validSignature = await verifyTiendanubeHmac(
    rawBody,
    request.headers.get("x-linkedstore-hmac-sha256"),
    env.TIENDANUBE_APP_SECRET,
  );
  if (!validSignature) return json({ error: "invalid_signature" }, 401);

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  // Tiendanube's mandatory privacy payloads identify the operation by the
  // configured endpoint and do not include an `event` field.
  if (payload.store_id == null) {
    return json({ error: "invalid_webhook_payload" }, 400);
  }

  const storeId = String(payload.store_id);
  if (!/^\d+$/.test(storeId)) return json({ error: "invalid_store_id" }, 400);

  if (expectedEvent === "store/redact") {
    await redactStore(storeId, env);
  } else if (expectedEvent === "customers/redact") {
    await redactCustomerOrders(storeId, numericIds(payload.orders_to_redact), env);
  } else {
    const orderIds = numericIds(payload.orders_requested);
    const externalRequestId = payload.data_request?.id == null ? null : String(payload.data_request.id);
    const requestKey = await sha256Hex(
      `${storeId}:customers/data_request:${externalRequestId ?? orderIds.join(",")}`,
    );
    await env.DB.prepare(
      `INSERT OR IGNORE INTO privacy_requests
        (request_key, store_id, request_type, external_request_id, order_count)
       VALUES (?, ?, 'customers/data_request', ?, ?)`,
    ).bind(requestKey, storeId, externalRequestId, orderIds.length).run();
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "privacy_webhook_received",
      topic: expectedEvent,
      store_id: storeId,
    }),
  );
  return json({ accepted: true }, 200);
}

async function redactCustomerOrders(storeId: string, orderIds: string[], env: Env): Promise<void> {
  for (const orderId of orderIds.slice(0, 500)) {
    const eventId = `tn_order_${orderId}`;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM delivery_attempts WHERE event_id = ?").bind(eventId),
      env.DB.prepare("DELETE FROM deliveries WHERE event_id = ? AND store_id = ?").bind(eventId, storeId),
      env.DB.prepare("DELETE FROM order_attribution WHERE store_id = ? AND order_id = ?").bind(storeId, orderId),
      env.DB.prepare("DELETE FROM webhook_receipts WHERE store_id = ? AND resource_id = ?").bind(storeId, orderId),
    ]);
  }
}

async function redactStore(storeId: string, env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM delivery_attempts WHERE event_id IN (SELECT event_id FROM deliveries WHERE store_id = ?)",
    ).bind(storeId),
    env.DB.prepare("DELETE FROM deliveries WHERE store_id = ?").bind(storeId),
    env.DB.prepare("DELETE FROM order_attribution WHERE store_id = ?").bind(storeId),
    env.DB.prepare("DELETE FROM webhook_receipts WHERE store_id = ?").bind(storeId),
    env.DB.prepare("DELETE FROM app_installations WHERE store_id = ?").bind(storeId),
    env.DB.prepare("DELETE FROM privacy_requests WHERE store_id = ?").bind(storeId),
    env.DB.prepare("DELETE FROM stores WHERE store_id = ?").bind(storeId),
  ]);
}

function numericIds(values: Array<number | string> | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).filter((value) => /^\d+$/.test(value)))];
}

async function exchangeAuthorizationCode(code: string, env: Env): Promise<TokenResponse> {
  const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
    },
    body: JSON.stringify({
      client_id: env.TIENDANUBE_APP_ID,
      client_secret: env.TIENDANUBE_APP_SECRET,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) {
    console.error(
      JSON.stringify({ level: "error", event: "oauth_token_exchange_failed", status: response.status }),
    );
    throw new Error("oauth_token_exchange_failed");
  }

  const body = (await response.json()) as Partial<TokenResponse>;
  if (!body.access_token || body.user_id == null || typeof body.scope !== "string") {
    throw new Error("invalid_oauth_token_response");
  }
  return body as TokenResponse;
}

async function ensureWebhook(
  storeId: string,
  accessToken: string,
  event: "order/paid",
  webhookUrl: string,
  env: Env,
): Promise<void> {
  const endpoint = new URL(`https://api.tiendanube.com/2025-03/${storeId}/webhooks`);
  endpoint.searchParams.set("event", event);
  endpoint.searchParams.set("url", webhookUrl);
  endpoint.searchParams.set("per_page", "200");

  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
  };

  const existingResponse = await fetch(endpoint, { headers });
  if (!existingResponse.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "tiendanube_webhook_list_failed",
        store_id: storeId,
        status: existingResponse.status,
      }),
    );
    throw new Error("tiendanube_webhook_list_failed");
  }

  const existing = (await existingResponse.json()) as Array<{ event?: string; url?: string }>;
  if (existing.some((webhook) => webhook.event === event && webhook.url === webhookUrl)) return;

  const createResponse = await fetch(
    `https://api.tiendanube.com/2025-03/${storeId}/webhooks`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ event, url: webhookUrl }),
    },
  );
  if (!createResponse.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "tiendanube_webhook_create_failed",
        store_id: storeId,
        webhook_event: event,
        status: createResponse.status,
      }),
    );
    throw new Error("tiendanube_webhook_create_failed");
  }
}

async function ensureStorefrontScriptAssociation(
  storeId: string,
  accessToken: string,
  env: Env,
): Promise<"created" | "refreshed"> {
  const scriptId = env.TIENDANUBE_STOREFRONT_SCRIPT_ID;
  if (!scriptId || !/^\d+$/.test(scriptId)) {
    throw new Error("invalid_tiendanube_storefront_script_id");
  }

  const queryParams = JSON.stringify({ worker: env.PUBLIC_BASE_URL });
  const response = await fetch(`https://api.tiendanube.com/2025-03/${storeId}/scripts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
    },
    body: JSON.stringify({ script_id: Number(scriptId), query_params: queryParams }),
    signal: AbortSignal.timeout(8_000),
  });

  if (response.status === 409) {
    const refreshResponse = await fetch(
      `https://api.tiendanube.com/2025-03/${storeId}/scripts/${scriptId}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "user-agent": `Open AI CAPI (${env.TIENDANUBE_CONTACT_EMAIL})`,
        },
        body: JSON.stringify({ script_id: Number(scriptId), query_params: queryParams }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!refreshResponse.ok) {
      throw new Error(`tiendanube_script_refresh_http_${refreshResponse.status}`);
    }
    console.log(JSON.stringify({
      level: "info",
      event: "tiendanube_script_association_refreshed",
      store_id: storeId,
      script_id: scriptId,
    }));
    return "refreshed";
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      level: "error",
      event: "tiendanube_script_association_failed",
      store_id: storeId,
      script_id: scriptId,
      status: response.status,
    }));
    throw new Error(`tiendanube_script_association_http_${response.status}`);
  }

  console.log(JSON.stringify({
    level: "info",
    event: "tiendanube_script_associated",
    store_id: storeId,
    script_id: scriptId,
  }));
  return "created";
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}


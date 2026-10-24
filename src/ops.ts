import { constantTimeEqual, sha256Hex } from "./crypto";
import type { Env, QueueMessage } from "./env";
import { json, methodNotAllowed } from "./http";
import {
  associateInstalledStoreWithScript,
  getInstalledStorefrontScriptStatus,
} from "./tiendanube";

export async function associateStorefrontScript(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  let input: { store_id?: unknown };
  try {
    input = await request.json() as { store_id?: unknown };
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const storeId = String(input.store_id ?? "");
  if (!/^\d+$/.test(storeId)) return json({ error: "invalid_store_id" }, 400);

  try {
    const result = await associateInstalledStoreWithScript(storeId, env);
    return json({ associated: true, result, store_id: storeId });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({
      level: "error",
      event: "operator_script_association_failed",
      store_id: storeId,
      error_code: errorCode,
    }));
    return json({ associated: false, error: errorCode }, 502);
  }
}

export async function storefrontScriptStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  const storeId = new URL(request.url).searchParams.get("store_id") ?? "";
  if (!/^\d+$/.test(storeId)) return json({ error: "invalid_store_id" }, 400);
  try {
    const script = await getInstalledStorefrontScriptStatus(storeId, env);
    return json({ store_id: storeId, script });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "unknown_error";
    return json({ error: errorCode }, 502);
  }
}

export async function replayOrder(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  let input: { store_id?: unknown; order_id?: unknown };
  try {
    input = await request.json() as { store_id?: unknown; order_id?: unknown };
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const storeId = String(input.store_id ?? "");
  const orderId = String(input.order_id ?? "");
  if (!/^\d+$/.test(storeId) || !/^\d+$/.test(orderId)) {
    return json({ error: "invalid_identifiers" }, 400);
  }
  const store = await env.DB.prepare(
    "SELECT enabled, validate_only FROM stores WHERE store_id = ? LIMIT 1",
  ).bind(storeId).first<{ enabled: number; validate_only: number }>();
  if (!store || store.enabled !== 1) return json({ error: "store_not_enabled" }, 409);

  const mode = store.validate_only === 1 ? "validate" : "live";
  const receiptKey = await sha256Hex(`${storeId}:manual-order-paid:${orderId}:${mode}`);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_receipts
      (idempotency_key, store_id, topic, resource_id, body_sha256)
     VALUES (?, ?, 'manual/order-paid', ?, ?)`,
  ).bind(receiptKey, storeId, orderId, await sha256Hex(`manual:${storeId}:${orderId}:${mode}`)).run();
  if ((inserted.meta.changes ?? 0) === 0) {
    return json({ accepted: true, duplicate: true, mode, event_id: `tn_order_${orderId}` });
  }
  const message: QueueMessage = {
    kind: "tiendanube_webhook",
    receiptKey,
    storeId,
    event: "order/paid",
    resourceId: orderId,
  };
  await env.EVENTS_QUEUE.send(message);
  return json({ accepted: true, mode, event_id: `tn_order_${orderId}` }, 202);
}

export async function orderStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  const orderId = new URL(request.url).searchParams.get("order_id");
  if (!orderId || !/^\d+$/.test(orderId)) return json({ error: "invalid_order_id" }, 400);
  const delivery = await env.DB.prepare(
    `SELECT event_id, store_id, event_type, validate_only, state, attempt_count,
      last_http_status, last_error_code, last_attempt_at, accepted_at, updated_at
     FROM deliveries WHERE event_id = ? LIMIT 1`,
  ).bind(`tn_order_${orderId}`).first();
  return delivery ? json({ delivery }) : json({ error: "not_found" }, 404);
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.OPERATOR_TEST_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(expected && supplied && constantTimeEqual(supplied, expected));
}

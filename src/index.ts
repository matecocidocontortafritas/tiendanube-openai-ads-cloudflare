import type { Env, QueueMessage } from "./env";
import { json } from "./http";
import { processQueueMessage } from "./processor";
import { serveStorefrontPixel } from "./pixel";
import {
  associateStorefrontScript,
  orderStatus,
  replayOrder,
  storefrontScriptStatus,
} from "./ops";
import {
  beginInstallation,
  completeInstallation,
  receiveOrderPaidWebhook,
  receivePrivacyWebhook,
} from "./tiendanube";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({ service: "Open AI CAPI", status: "ready" });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

        return json({
          status: result?.ok === 1 ? "ok" : "degraded",
          service: env.SERVICE_NAME || "tiendanube-openai-ads",
          environment: env.ENVIRONMENT || "staging",
          dependencies: {
            d1: result?.ok === 1,
            queue: Boolean(env.EVENTS_QUEUE),
          },
        });
      } catch {
        return json(
          {
            status: "unavailable",
            service: env.SERVICE_NAME || "tiendanube-openai-ads",
            environment: env.ENVIRONMENT || "staging",
          },
          503,
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/pixel/storefront.js") {
      return serveStorefrontPixel(request, env);
    }

    if (url.pathname === "/ops/replay-order") return replayOrder(request, env);
    if (url.pathname === "/ops/order-status") return orderStatus(request, env);
    if (url.pathname === "/ops/associate-storefront-script") {
      return associateStorefrontScript(request, env);
    }
    if (url.pathname === "/ops/storefront-script-status") {
      return storefrontScriptStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/tiendanube/install") {
      return beginInstallation(env);
    }

    if (request.method === "GET" && url.pathname === "/tiendanube/oauth/callback") {
      try {
        return await completeInstallation(request, env);
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "tiendanube_oauth_callback_failed",
            error_code: error instanceof Error ? error.message : "unknown_error",
          }),
        );
        return json({ error: "installation_failed" }, 502);
      }
    }

    if (url.pathname === "/webhooks/tiendanube/order-paid") {
      return receiveOrderPaidWebhook(request, env);
    }

    if (url.pathname === "/webhooks/tiendanube/privacy/store-redact") {
      return receivePrivacyWebhook(request, env, "store/redact");
    }

    if (url.pathname === "/webhooks/tiendanube/privacy/customer-redact") {
      return receivePrivacyWebhook(request, env, "customers/redact");
    }

    if (url.pathname === "/webhooks/tiendanube/privacy/customers-data-request") {
      return receivePrivacyWebhook(request, env, "customers/data_request");
    }

    return json({ error: "not_found" }, 404);
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await processQueueMessage(message, env);
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>;

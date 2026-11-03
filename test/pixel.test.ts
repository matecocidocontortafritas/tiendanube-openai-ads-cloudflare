import assert from "node:assert/strict";
import test from "node:test";

import type { Env } from "../src/env.ts";
import { serveStorefrontPixel, serveStorefrontPixelByClient } from "../src/pixel.ts";

function pixelEnv(store: { enabled?: number; pixelSlot?: string } = {}): Env {
  const row = {
    client_key: "DEMO",
    pixel_secret_slot: store.pixelSlot ?? "OPENAI_PIXEL_ID_DEMO",
    enabled: store.enabled ?? 1,
  };
  return {
    OPENAI_PIXEL_ID_DEMO: "pixel-demo",
    DB: {
      prepare() {
        return {
          bind() {
            return { first: async () => row };
          },
        };
      },
    },
  } as unknown as Env;
}

test("serves the official ecommerce funnel and Tiendanube legacy theme selectors", async () => {
  const response = await serveStorefrontPixel(
    new Request("https://worker.example/pixel/storefront.js?store_id=123456"),
    pixelEnv(),
  );
  const source = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotThrow(() => new Function(source));
  for (const eventName of [
    "page_viewed",
    "contents_viewed",
    "items_added",
    "checkout_started",
    "order_created",
  ]) {
    assert.match(source, new RegExp(`measure\\(\\"${eventName}\\"`));
  }
  assert.match(source, /product\.add-to-cart/);
  assert.match(source, /js-addtocart/);
  assert.match(source, /closest\('\[data-component="product\.add-to-cart"\], \.js-addtocart'\)/);
  assert.match(source, /js-cart-widget-amount/);
  assert.match(source, /add_to_cart/);
  assert.match(source, /product-form/);
  assert.match(source, /go_to_checkout/);
  assert.match(source, /cart\.checkout-button/);
  assert.match(source, /price_number_raw/);
  assert.match(source, /shipping-variant-id/);
  assert.match(source, /tn_order_/);
});

test("fails closed for an invalid store id", async () => {
  const response = await serveStorefrontPixel(
    new Request("https://worker.example/pixel/storefront.js?store_id=not-a-store"),
    pixelEnv(),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_store_id" });
});

test("does not serve a pixel for a disabled store", async () => {
  const response = await serveStorefrontPixel(
    new Request("https://worker.example/pixel/storefront.js?store_id=123456"),
    pixelEnv({ enabled: 0 }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "store_not_enabled" });
});

test("resolves a client-specific compatibility route without a cross-client fallback", async () => {
  const env = pixelEnv();
  const originalPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = ((sql: string) => {
    if (sql.includes("SELECT store_id FROM stores")) {
      return {
        bind(clientKey: string) {
          return { first: async () => clientKey === "demo" ? { store_id: "123456" } : null };
        },
      };
    }
    return originalPrepare(sql);
  }) as D1Database["prepare"];

  const response = await serveStorefrontPixelByClient(
    new Request("https://worker.example/pixel/demo.js"),
    env,
    "demo",
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /pixel-demo/);

  const unknown = await serveStorefrontPixelByClient(
    new Request("https://worker.example/pixel/unknown.js"),
    env,
    "unknown",
  );
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "client_not_found" });
});

test("rejects malformed client keys", async () => {
  const response = await serveStorefrontPixelByClient(
    new Request("https://worker.example/pixel/bad.js"),
    pixelEnv(),
    "../bad",
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_client_key" });
});

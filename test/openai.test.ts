import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import {
  attributionFromOrder,
  buildOrderCreatedEvent,
  decimalToMinorUnits,
  PermanentEventError,
} from "../src/openai.ts";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const NOW = Date.parse("2026-10-24T12:00:00Z");

test("converts decimal amounts using the ISO currency exponent", () => {
  assert.equal(decimalToMinorUnits("123.45", "ARS"), 12_345);
  assert.equal(decimalToMinorUnits("123.5", "JPY"), 124);
  assert.equal(decimalToMinorUnits("1.2345", "KWD"), 1_235);
});

test("builds the official order_created shape and deterministic event id", async () => {
  const event = await buildOrderCreatedEvent(
    {
      id: 987,
      payment_status: "paid",
      paid_at: "2026-10-24T11:30:00Z",
      total: "1500.50",
      currency: "ars",
      products: [{ product_id: 20, variant_id: 21, name: "Remera", quantity: 2, price: "700.25" }],
      customer: { id: 44, email: " Buyer@Example.com " },
      shipping_address: { city: "Quilmes", province: "Buenos Aires", zipcode: "1878", country: "AR" },
    },
    "https://shop.example.com",
    { oppref: "opaque-click", obref: "opaque-browser" },
    NOW,
  );

  assert.equal(event.id, "tn_order_987");
  assert.equal(event.type, "order_created");
  assert.equal(event.action_source, "web");
  assert.equal(event.data.type, "contents");
  assert.equal(event.data.amount, 150_050);
  assert.equal(event.data.contents[0]?.amount, 70_025);
  assert.equal(event.data.contents[0]?.quantity, 2);
  assert.equal(event.oppref, "opaque-click");
  assert.equal(event.user?.obref, "opaque-browser");
  assert.deepEqual(event.user?.emails_sha256, [sha256("buyer@example.com")]);
  assert.deepEqual(event.user?.external_ids_sha256, [sha256("tn_customer_44")]);
});

test("uses order.extra attribution only when measurement consent is persisted", () => {
  assert.deepEqual(attributionFromOrder({ id: 1, extra: { openai_oppref: "x" } }), {});
  assert.deepEqual(
    attributionFromOrder({
      id: 1,
      extra: {
        openai_measurement_consent: "true",
        openai_oppref: "click",
        openai_obref: "browser",
        openai_source_url: "https://shop.example.com/producto",
      },
    }),
    { oppref: "click", obref: "browser", sourceUrl: "https://shop.example.com/producto" },
  );
});

test("rejects non-paid and stale orders before delivery", async () => {
  await assert.rejects(
    buildOrderCreatedEvent(
      { id: 1, payment_status: "pending", paid_at: "2026-10-24T11:00:00Z", total: "1", currency: "ARS" },
      "https://shop.example.com",
      {},
      NOW,
    ),
    (error: unknown) => error instanceof PermanentEventError && error.code === "order_not_paid",
  );
  await assert.rejects(
    buildOrderCreatedEvent(
      { id: 1, payment_status: "paid", paid_at: "2026-10-01T11:00:00Z", total: "1", currency: "ARS" },
      "https://shop.example.com",
      {},
      NOW,
    ),
    (error: unknown) => error instanceof PermanentEventError && error.code === "event_older_than_seven_days",
  );
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

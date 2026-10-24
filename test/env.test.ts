import assert from "node:assert/strict";
import test from "node:test";

import { secretBinding, type Env } from "../src/env.ts";

test("resolves only the explicitly configured client secret prefix", () => {
  const env = {
    OPENAI_PIXEL_ID_DEMO: "pixel-demo",
    OPENAI_CAPI_KEY_DEMO: "capi-demo",
  } as unknown as Env;

  assert.equal(secretBinding(env, "OPENAI_PIXEL_ID_DEMO", "OPENAI_PIXEL_ID_"), "pixel-demo");
  assert.equal(secretBinding(env, "OPENAI_CAPI_KEY_DEMO", "OPENAI_CAPI_KEY_"), "capi-demo");
  assert.equal(secretBinding(env, "OPENAI_CAPI_KEY_DEMO", "OPENAI_PIXEL_ID_"), null);
  assert.equal(secretBinding(env, "OTHER_SECRET", "OPENAI_CAPI_KEY_"), null);
});

test("fails closed for missing or blank client secrets", () => {
  const env = { OPENAI_PIXEL_ID_DEMO: "  " } as unknown as Env;
  assert.equal(secretBinding(env, "OPENAI_PIXEL_ID_DEMO", "OPENAI_PIXEL_ID_"), null);
  assert.equal(secretBinding(env, "OPENAI_PIXEL_ID_UNKNOWN", "OPENAI_PIXEL_ID_"), null);
});

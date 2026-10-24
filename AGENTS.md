# Repository instructions

## Non-negotiable integration invariants

- Verify current official OpenAI Ads, Tiendanube and Cloudflare documentation before changing event names, schemas, endpoints, authentication or Script behavior.
- Keep the purchase event `order_created` unless official OpenAI documentation changes it.
- Browser `event_id` and CAPI `id` for one order must both be `tn_order_<ORDER_ID>` and use the same Pixel ID.
- Never expose a CAPI key, Tiendanube app secret, OAuth token, encryption key or operator token to browser code, logs, fixtures, screenshots or Git.
- Keep each store mapped to explicit `OPENAI_PIXEL_ID_<CLIENT>` and `OPENAI_CAPI_KEY_<CLIENT>` bindings. Do not add a cross-client fallback.
- Verify Tiendanube webhooks against the unmodified raw body before parsing JSON.
- Never log order payloads or raw customer data. Log stable IDs, status codes and sanitized error codes only.
- New stores start with `validate_only=1` and disabled until OAuth and Script association are verified.
- Do not claim browser purchase tracking is operational unless it is observed on the real success-page runtime. Treat NubeSDK compatibility as a separate requirement.

## Change discipline

- Preserve ignored operational files such as `wrangler.jsonc`, `.dev.vars`, `.env` and `.local/`.
- Do not deploy, rotate/delete credentials, send external messages, create a public repository or enable real event delivery without the user's explicit authorization.
- Run `npm test` and `npm run typecheck` after code changes.
- Keep documentation examples fictional and use placeholders for account, app, store, Pixel, database and domain identifiers.
- If documentation and implementation disagree, stop and resolve the discrepancy before release.

## Review priorities

1. secrets or PII exposure;
2. cross-client credential mixups;
3. webhook authentication and idempotency regressions;
4. incorrect event names, monetary units or deduplication IDs;
5. false claims about checkout/thank-you coverage;
6. retry behavior that can lose or multiply events.

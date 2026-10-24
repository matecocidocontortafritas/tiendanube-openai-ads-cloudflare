## Summary

Describe the problem and the result.

## Official documentation checked

- OpenAI Ads:
- Tiendanube:
- Cloudflare:

## Verification

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] no secrets, PII or client identifiers are included
- [ ] Pixel/CAPI event names and schemas still match official docs
- [ ] `tn_order_<ORDER_ID>` deduplication is preserved
- [ ] browser versus server coverage and limitations are documented

## Security and rollout

Describe credential, privacy, multi-client, retry and deployment impact. Production rollout must be a separate, explicitly authorized action.

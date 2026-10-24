# Contributing

Contributions are welcome when they preserve the security and measurement invariants in [`AGENTS.md`](AGENTS.md).

## Development

```bash
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npm test
npm run typecheck
```

Use fictional stores and credentials. Never attach real order payloads to issues or pull requests.

## Pull requests

Describe:

- problem and intended behavior;
- official documentation used;
- security/privacy impact;
- browser versus server impact;
- tests performed;
- any known Tiendanube theme, checkout or NubeSDK limitation.

Changes to event schemas must link current official OpenAI documentation. Changes to Scripts/OAuth/webhooks must link current official Tiendanube documentation.

## Definition of done

- tests and typecheck pass;
- no secrets or client identifiers are staged;
- docs and code agree;
- deduplication stays deterministic;
- new failure paths are observable without logging PII;
- production deployment is not bundled into the contribution.

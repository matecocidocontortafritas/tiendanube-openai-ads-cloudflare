# Security policy

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, store access tokens or exploitable production details. Contact the repository maintainer privately through the security contact configured in the GitHub repository.

Before publishing this project, replace this paragraph with a monitored security email or enable GitHub private vulnerability reporting.

Include:

- affected commit/version;
- impact and reproduction using fictional data;
- whether any credential or customer data may have been exposed;
- suggested mitigation if known.

Never include the secret itself. Identify it by binding name and immediately revoke/rotate it with the issuing platform.

## Supported versions

Until tagged releases exist, only the current default branch is maintained. Production operators should pin a reviewed commit rather than deploying an arbitrary moving branch.

## Security boundaries

- Pixel IDs are browser-visible identifiers, not authentication credentials.
- OpenAI CAPI keys, Tiendanube app secrets, OAuth tokens, encryption keys and operator tokens are secrets.
- D1 stores OAuth tokens only as AES-GCM ciphertext.
- Customer matching values are normalized and hashed before delivery.
- This repository does not provide a complete consent or legal-compliance program.

## Incident response minimum

1. disable the affected store or set `validate_only=1`;
2. revoke exposed credentials;
3. replace Cloudflare Secrets;
4. inspect Git history, CI logs, terminal output and screenshots;
5. verify one controlled event;
6. document scope and follow applicable notification obligations.

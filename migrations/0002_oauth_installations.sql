CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
) STRICT;

CREATE INDEX idx_oauth_states_expiry
  ON oauth_states(expires_at, used_at);

CREATE TABLE app_installations (
  store_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'uninstalled')),
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;


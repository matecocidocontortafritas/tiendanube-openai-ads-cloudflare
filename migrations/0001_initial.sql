PRAGMA foreign_keys = ON;

CREATE TABLE stores (
  store_id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL UNIQUE,
  store_origin TEXT NOT NULL,
  source_url TEXT NOT NULL,
  app_secret_slot TEXT NOT NULL,
  tiendanube_token_slot TEXT NOT NULL,
  pixel_secret_slot TEXT NOT NULL,
  capi_secret_slot TEXT NOT NULL,
  ads_api_secret_slot TEXT,
  validate_only INTEGER NOT NULL DEFAULT 1 CHECK (validate_only IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE webhook_receipts (
  idempotency_key TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'ignored', 'failed')
  ),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) STRICT;

CREATE INDEX idx_webhook_receipts_status_received
  ON webhook_receipts(status, received_at);

CREATE TABLE order_attribution (
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  oppref TEXT,
  obref TEXT,
  source_url TEXT,
  consented_at TEXT,
  verified_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (store_id, order_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) STRICT;

CREATE INDEX idx_order_attribution_expires
  ON order_attribution(expires_at);

CREATE TABLE deliveries (
  event_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  validate_only INTEGER NOT NULL CHECK (validate_only IN (0, 1)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'validating', 'validated', 'sending', 'delivered', 'retrying', 'permanent_failure')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_sha256 TEXT,
  last_http_status INTEGER,
  last_error_code TEXT,
  first_enqueued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at TEXT,
  accepted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (store_id, order_id, event_type),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) STRICT;

CREATE INDEX idx_deliveries_state_updated
  ON deliveries(state, updated_at);

CREATE TABLE delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  integration TEXT NOT NULL CHECK (integration IN ('tiendanube', 'openai')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'retryable_error', 'permanent_error')),
  http_status INTEGER,
  error_code TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES deliveries(event_id)
) STRICT;

CREATE INDEX idx_delivery_attempts_event
  ON delivery_attempts(event_id, attempt_number);

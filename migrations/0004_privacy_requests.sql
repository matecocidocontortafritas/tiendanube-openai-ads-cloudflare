CREATE TABLE privacy_requests (
  request_key TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('customers/data_request')),
  external_request_id TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_manual_report' CHECK (
    status IN ('pending_manual_report', 'completed')
  ),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
) STRICT;

CREATE INDEX idx_privacy_requests_status
  ON privacy_requests(status, received_at);

export interface Env {
  ENVIRONMENT: string;
  SERVICE_NAME?: string;
  INTEGRATION_SOURCE?: string;
  PUBLIC_BASE_URL: string;
  TIENDANUBE_APP_ID: string;
  TIENDANUBE_CONTACT_EMAIL: string;
  TIENDANUBE_STOREFRONT_SCRIPT_ID?: string;
  TIENDANUBE_APP_SECRET?: string;
  CREDENTIALS_ENCRYPTION_KEY?: string;
  OPERATOR_TEST_TOKEN?: string;
  DB: D1Database;
  EVENTS_QUEUE: Queue<QueueMessage>;
  [binding: string]: unknown;
}

export function secretBinding(env: Env, slot: string, prefix: string): string | null {
  if (!new RegExp(`^${prefix}[A-Z0-9_]+$`).test(slot)) return null;
  const value = env[slot];
  return typeof value === "string" && value.trim() ? value : null;
}

export type QueueMessage = {
  kind: "tiendanube_webhook";
  receiptKey: string;
  storeId: string;
  event: "order/paid";
  resourceId: string;
};


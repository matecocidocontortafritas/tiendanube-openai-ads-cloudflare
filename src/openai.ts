import { sha256Hex } from "./crypto.ts";

export type TiendanubeOrder = {
  id: number | string;
  payment_status?: string;
  paid_at?: string | null;
  created_at?: string | null;
  total?: string | number;
  currency?: string;
  landing_url?: string | null;
  extra?: Record<string, unknown> | null;
  products?: Array<{
    id?: number | string;
    product_id?: number | string;
    variant_id?: number | string;
    name?: string;
    quantity?: number | string;
    price?: string | number;
    variant_values?: Array<string | { name?: string; value?: string }>;
  }>;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  contact_email?: string;
  contact_phone?: string;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    city?: string;
    province?: string;
    zipcode?: string;
    country?: string;
  } | null;
  client_details?: {
    browser_ip?: string;
    user_agent?: string;
  } | null;
};

export type Attribution = {
  oppref?: string | null;
  obref?: string | null;
  sourceUrl?: string | null;
};

export function attributionFromOrder(order: TiendanubeOrder): Attribution {
  const extra = order.extra;
  if (!extra || extra.openai_measurement_consent !== "true") return {};
  return {
    oppref: typeof extra.openai_oppref === "string" ? extra.openai_oppref : undefined,
    obref: typeof extra.openai_obref === "string" ? extra.openai_obref : undefined,
    sourceUrl: typeof extra.openai_source_url === "string" ? extra.openai_source_url : undefined,
  };
}

export type OpenAIEvent = {
  id: string;
  type: "order_created";
  timestamp_ms: number;
  oppref?: string;
  source_url: string;
  action_source: "web";
  user?: Record<string, string | string[]>;
  data: {
    type: "contents";
    amount: number;
    currency: string;
    contents: Array<Record<string, string | number | Record<string, string>>>;
  };
};

export class PermanentEventError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "PermanentEventError";
  }
}

export async function buildOrderCreatedEvent(
  order: TiendanubeOrder,
  sourceUrl: string,
  attribution: Attribution = {},
  nowMs = Date.now(),
): Promise<OpenAIEvent> {
  if (order.payment_status !== "paid") throw new PermanentEventError("order_not_paid");

  const orderId = String(order.id);
  if (!/^\d+$/.test(orderId)) throw new PermanentEventError("invalid_order_id");

  const currency = String(order.currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new PermanentEventError("invalid_currency");
  const amount = decimalToMinorUnits(order.total, currency);

  const timestampMs = parseEventTimestamp(order.paid_at ?? order.created_at, nowMs);
  const products = Array.isArray(order.products) ? order.products : [];
  const contents = products.map((product) => {
    const quantity = integerQuantity(product.quantity);
    const id = product.variant_id ?? product.product_id ?? product.id;
    const content: Record<string, string | number | Record<string, string>> = {
      content_type: "product",
      quantity,
    };
    if (id != null) content.id = String(id);
    if (product.product_id != null) content.group_id = String(product.product_id);
    if (typeof product.name === "string" && product.name.trim()) {
      content.name = product.name.trim().slice(0, 512);
    }
    if (product.price != null) {
      content.amount = decimalToMinorUnits(product.price, currency);
      content.currency = currency;
    }
    const variantDict = buildVariantDict(product.variant_values);
    if (variantDict) content.variant_dict = variantDict;
    return content;
  });

  const user = await buildUser(order, attribution.obref);
  const event: OpenAIEvent = {
    id: `tn_order_${orderId}`,
    type: "order_created",
    timestamp_ms: timestampMs,
    source_url: validSourceUrl(attribution.sourceUrl) ?? validSourceUrl(sourceUrl) ?? failSourceUrl(),
    action_source: "web",
    data: { type: "contents", amount, currency, contents },
  };
  if (nonBlank(attribution.oppref)) event.oppref = attribution.oppref!.trim();
  if (Object.keys(user).length > 0) event.user = user;
  return event;
}

export function decimalToMinorUnits(value: unknown, currency: string): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new PermanentEventError("invalid_amount");
  const exponent = currencyExponent(currency);
  const [whole, fraction = ""] = raw.split(".");
  const kept = fraction.padEnd(exponent, "0").slice(0, exponent) || "0";
  const next = fraction.charAt(exponent);
  let minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(kept);
  if (next >= "5") minor += 1n;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new PermanentEventError("amount_out_of_range");
  return Number(minor);
}

function currencyExponent(currency: string): number {
  try {
    const exponent = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
    if (Number.isInteger(exponent) && exponent >= 0 && exponent <= 3) return exponent;
  } catch {
    throw new PermanentEventError("invalid_currency");
  }
  throw new PermanentEventError("unsupported_currency_exponent");
}

function parseEventTimestamp(value: string | null | undefined, nowMs: number): number {
  if (!value) throw new PermanentEventError("missing_event_timestamp");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new PermanentEventError("invalid_event_timestamp");
  if (timestamp < nowMs - 7 * 24 * 60 * 60 * 1000) {
    throw new PermanentEventError("event_older_than_seven_days");
  }
  if (timestamp > nowMs + 10 * 60 * 1000) {
    throw new PermanentEventError("event_timestamp_in_future");
  }
  return timestamp;
}

function integerQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1) throw new PermanentEventError("invalid_quantity");
  return quantity;
}

function buildVariantDict(
  values: Array<string | { name?: string; value?: string }> | undefined,
): Record<string, string> | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const result: Record<string, string> = {};
  values.slice(0, 20).forEach((entry, index) => {
    if (typeof entry === "string" && entry.trim()) result[`option_${index + 1}`] = entry.trim();
    else if (entry && typeof entry === "object") {
      const key = nonBlank(entry.name) ? entry.name!.trim() : `option_${index + 1}`;
      if (nonBlank(entry.value)) result[key] = entry.value!.trim();
    }
  });
  return Object.keys(result).length > 0 ? result : undefined;
}

async function buildUser(
  order: TiendanubeOrder,
  obref: string | null | undefined,
): Promise<Record<string, string | string[]>> {
  const user: Record<string, string | string[]> = {};
  const customer = order.customer ?? {};
  const address = order.shipping_address ?? {};
  const email = firstNonBlank(customer.email, order.contact_email);
  const phone = normalizePhone(firstNonBlank(customer.phone, order.contact_phone, address.phone));
  const firstName = normalizeName(firstNonBlank(customer.first_name, address.first_name));
  const lastName = normalizeName(firstNonBlank(customer.last_name, address.last_name));

  if (email) user.emails_sha256 = [await sha256Hex(email.trim().toLowerCase())];
  if (phone) user.phone_numbers_sha256 = [await sha256Hex(phone)];
  if (customer.id != null) {
    user.external_ids_sha256 = [await sha256Hex(`tn_customer_${String(customer.id).trim()}`)];
  }
  if (firstName) user.first_names_sha256 = [await sha256Hex(firstName)];
  if (lastName) user.last_names_sha256 = [await sha256Hex(lastName)];
  if (validGeo(address.province, 128)) user.regions = [address.province!.trim()];
  if (validGeo(address.city, 128)) user.cities = [address.city!.trim()];
  if (address.zipcode && /^[A-Za-z0-9 -]{1,32}$/.test(address.zipcode.trim())) {
    user.postal_codes = [address.zipcode.trim()];
  }
  if (address.country && /^[A-Za-z]{2}$/.test(address.country.trim())) {
    user.countries = [address.country.trim().toUpperCase()];
  }
  if (nonBlank(obref)) user.obref = obref!.trim();
  if (nonBlank(order.client_details?.browser_ip)) user.ip_address = order.client_details!.browser_ip!.trim();
  if (nonBlank(order.client_details?.user_agent)) user.user_agent = order.client_details!.user_agent!.trim();
  return user;
}

function normalizePhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .replace(/[\s().-]/g, "")
    .replace(/^\+/, "")
    .replace(/^0+/, "");
  return /^\d{8,15}$/.test(normalized) ? normalized : undefined;
}

function normalizeName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[\s\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/g, "");
  return normalized || undefined;
}

function validGeo(value: string | undefined, max: number): boolean {
  return Boolean(value?.trim() && value.trim().length <= max);
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => nonBlank(value))?.trim();
}

function nonBlank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validSourceUrl(value: string | null | undefined): string | undefined {
  if (!nonBlank(value)) return undefined;
  try {
    const url = new URL(value!);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function failSourceUrl(): never {
  throw new PermanentEventError("invalid_source_url");
}

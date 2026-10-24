import { secretBinding, type Env } from "./env";
import { json } from "./http";

export async function serveStorefrontPixel(request: Request, env: Env): Promise<Response> {
  const storeId = new URL(request.url).searchParams.get("store_id") ?? "";
  if (!/^\d+$/.test(storeId)) return json({ error: "invalid_store_id" }, 400);
  const store = await env.DB.prepare(
    "SELECT client_key, pixel_secret_slot, enabled FROM stores WHERE store_id = ? LIMIT 1",
  ).bind(storeId).first<{ client_key: string; pixel_secret_slot: string; enabled: number }>();
  if (!store || store.enabled !== 1) return json({ error: "store_not_enabled" }, 404);
  const resolvedPixelId = secretBinding(env, store.pixel_secret_slot, "OPENAI_PIXEL_ID_");
  if (!resolvedPixelId) return json({ error: "pixel_not_configured" }, 503);
  const pixelId = JSON.stringify(resolvedPixelId);
  const clientKey = JSON.stringify(store.client_key);
  const source = `/* OpenAI Ads Measurement Pixel for Tiendanube / generated per store */
(function (w, d) {
  "use strict";
  if (w.__openAIAdsTiendanubeLoaded) return;
  w.__openAIAdsTiendanubeLoaded = true;

  var PIXEL_ID = ${pixelId};
  var CLIENT_KEY = ${clientKey};
  var ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var consent = w.openAIAdsMeasurementConsent !== false;

  function safeGet(key) { try { return w.localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { w.localStorage.setItem(key, value); } catch (_) {} }
  function safeRemove(key) { try { w.localStorage.removeItem(key); } catch (_) {} }
  function cookie(name) {
    var prefix = name + "=";
    var parts = d.cookie ? d.cookie.split(";") : [];
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i].trim();
      if (part.indexOf(prefix) === 0) return decodeURIComponent(part.slice(prefix.length));
    }
    return null;
  }
  function remember(key, value) {
    if (!consent || !value) return;
    safeSet(key, JSON.stringify({ value: value, expires: Date.now() + ATTR_TTL_MS }));
  }
  function recall(key) {
    try {
      var parsed = JSON.parse(safeGet(key) || "null");
      return parsed && parsed.expires > Date.now() && typeof parsed.value === "string" ? parsed.value : null;
    } catch (_) { return null; }
  }
  function ls() { return w.LS && typeof w.LS === "object" ? w.LS : {}; }
  function currency() {
    var value = ls().currency;
    return String(value && typeof value === "object" ? value.code : value || "ARS").toUpperCase();
  }
  function cartData() {
    var cart = ls().cart || {};
    var items = Array.isArray(cart.items) ? cart.items : [];
    return {
      type: "contents",
      amount: Number(cart.subtotal || 0),
      currency: currency(),
      contents: items.map(function (item) {
        return {
          id: String(item.id || ""),
          name: item.name ? String(item.name) : undefined,
          content_type: "product",
          quantity: Number(item.quantity || 1),
          amount: Number(item.unit_price || 0),
          currency: currency()
        };
      })
    };
  }
  function cartSnapshot() {
    var items = (ls().cart && Array.isArray(ls().cart.items)) ? ls().cart.items : [];
    var snapshot = {};
    items.forEach(function (item) { snapshot[String(item.id || "")] = Number(item.quantity || 0); });
    return snapshot;
  }
  function detectItemsAdded(before, finalCheck) {
    var cart = ls().cart || {};
    var items = Array.isArray(cart.items) ? cart.items : [];
    var added = [];
    var addedAmount = 0;
    items.forEach(function (item) {
      var id = String(item.id || "");
      var delta = Number(item.quantity || 0) - Number(before[id] || 0);
      if (delta > 0) {
        var unit = Number(item.unit_price || 0);
        addedAmount += unit * delta;
        added.push({ id: id, name: item.name ? String(item.name) : undefined, content_type: "product", quantity: delta, amount: unit, currency: currency() });
      }
    });
    if (added.length > 0) {
      measure("items_added", { type: "contents", amount: addedAmount, currency: currency(), contents: added });
      safeRemove("openai_ads_cart_before_add");
      return true;
    }
    if (finalCheck) safeRemove("openai_ads_cart_before_add");
    return false;
  }
  function measure(name, data, options) {
    if (!consent || typeof w.oaiq !== "function") return;
    try { w.oaiq("measure", name, data, options); } catch (_) {}
  }
  function installSdk() {
    if (!w.oaiq) {
      var q = function () { q.q.push(arguments); };
      q.q = [];
      w.oaiq = q;
      var js = d.createElement("script");
      js.async = true;
      js.src = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
      var first = d.getElementsByTagName("script")[0];
      if (first && first.parentNode) first.parentNode.insertBefore(js, first);
      else (d.head || d.documentElement).appendChild(js);
    }
    w.oaiq("consent", consent);
    w.oaiq("init", { pixelId: PIXEL_ID });
  }
  function captureAttribution() {
    if (!consent) return;
    var oppref = new URL(w.location.href).searchParams.get("oppref");
    if (oppref) remember("openai_ads_oppref", oppref);
    var obref = cookie("__obref");
    if (obref) remember("openai_ads_obref", obref);
  }
  function addAttributionInputs() {
    if (!consent) return;
    var values = {
      openai_measurement_consent: "true",
      openai_oppref: recall("openai_ads_oppref"),
      openai_obref: cookie("__obref") || recall("openai_ads_obref"),
      openai_source_url: w.location.origin + w.location.pathname
    };
    var forms = d.querySelectorAll("form");
    Array.prototype.forEach.call(forms, function (form) {
      var action = String(form.getAttribute("action") || "").toLowerCase();
      if (action.indexOf("checkout") < 0 && !form.querySelector('[name^="extra["]')) return;
      Object.keys(values).forEach(function (key) {
        if (!values[key]) return;
        var name = "extra[" + key + "]";
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) {
          input = d.createElement("input");
          input.type = "hidden";
          input.name = name;
          form.appendChild(input);
        }
        input.value = values[key];
      });
    });
  }
  function pageEvents() {
    measure("page_viewed", {
      type: "contents",
      contents: [{ id: w.location.pathname || "/", name: d.title || undefined, content_type: "page" }]
    });
    var product = ls().product;
    if (product && product.id != null) {
      measure("contents_viewed", {
        type: "contents",
        contents: [{ id: String(product.id), name: product.name ? String(product.name) : undefined, content_type: "product" }]
      });
    }
    var order = ls().order;
    if (order && order.id != null) {
      measure("order_created", {
        type: "contents",
        amount: Number(order.total || 0),
        currency: currency()
      }, { event_id: "tn_order_" + String(order.id) });
    }
  }
  function commerceListeners() {
    d.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || typeof form.getAttribute !== "function") return;
      var action = String(form.getAttribute("action") || "").toLowerCase();
      if (action.indexOf("checkout") >= 0) measure("checkout_started", cartData());
      if (/cart|carrito/.test(action)) {
        var before = cartSnapshot();
        safeSet("openai_ads_cart_before_add", JSON.stringify(before));
        w.setTimeout(function () { detectItemsAdded(before, false); }, 800);
        w.setTimeout(function () { detectItemsAdded(before, true); }, 2500);
      }
    }, true);
    d.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest('a[href*="checkout"], button[data-action*="checkout"]') : null;
      if (target) measure("checkout_started", cartData());
    }, true);
  }

  w.OpenAIAdsTiendanube = {
    clientKey: CLIENT_KEY,
    setConsent: function (allowed) {
      consent = allowed === true;
      if (typeof w.oaiq === "function") w.oaiq("consent", consent);
      if (consent) { captureAttribution(); addAttributionInputs(); }
    },
    measure: measure
  };

  installSdk();
  captureAttribution();
  w.setTimeout(captureAttribution, 1500);
  var pendingCart = safeGet("openai_ads_cart_before_add");
  if (pendingCart) {
    try { detectItemsAdded(JSON.parse(pendingCart), true); } catch (_) { safeRemove("openai_ads_cart_before_add"); }
  }
  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", function () { addAttributionInputs(); pageEvents(); commerceListeners(); });
  } else {
    addAttributionInputs(); pageEvents(); commerceListeners();
  }
})(window, document);`;

  return new Response(source, {
    status: 200,
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "application/javascript; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

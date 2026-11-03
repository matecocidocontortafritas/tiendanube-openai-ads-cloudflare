import { secretBinding, type Env } from "./env.ts";
import { json } from "./http.ts";

export async function serveStorefrontPixelByClient(
  request: Request,
  env: Env,
  clientKey: string,
): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(clientKey)) {
    return json({ error: "invalid_client_key" }, 400);
  }

  const store = await env.DB.prepare(
    "SELECT store_id FROM stores WHERE client_key = ? LIMIT 1",
  ).bind(clientKey).first<{ store_id: string | number }>();
  if (!store) return json({ error: "client_not_found" }, 404);

  const url = new URL(request.url);
  url.pathname = "/pixel/storefront.js";
  url.searchParams.set("store_id", String(store.store_id));
  return serveStorefrontPixel(new Request(url, request), env);
}

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
  function currentVariant() {
    var variants = Array.isArray(ls().variants) ? ls().variants : [];
    var input = d.querySelector('[name="variant_id"]:checked, [name="variant_id"], #shipping-variant-id');
    var selectedId = input && input.value != null ? String(input.value) : "";
    if (selectedId) {
      for (var i = 0; i < variants.length; i += 1) {
        if (String(variants[i].id || "") === selectedId) return variants[i];
      }
    }
    return variants.length === 1 ? variants[0] : null;
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
  function attribute(element, name) {
    return element && typeof element.getAttribute === "function"
      ? String(element.getAttribute(name) || "").toLowerCase()
      : "";
  }
  function controlLabel(element) {
    if (!element) return "";
    return String(element.value || element.textContent || "").trim().toLowerCase();
  }
  function isCheckoutControl(element) {
    var name = attribute(element, "name");
    var component = attribute(element, "data-component");
    var action = attribute(element, "data-action");
    var label = controlLabel(element);
    return name === "go_to_checkout" ||
      component === "cart.checkout-button" ||
      action.indexOf("checkout") >= 0 ||
      /iniciar compra|finalizar compra|checkout/.test(label);
  }
  function isAddToCart(form, submitter) {
    var component = attribute(submitter, "data-component");
    var className = attribute(submitter, "class");
    var store = attribute(form, "data-store");
    var action = attribute(form, "action");
    return component === "product.add-to-cart" ||
      className.indexOf("js-addtocart") >= 0 ||
      store.indexOf("product-form") === 0 ||
      (!isCheckoutControl(submitter) && /cart|carrito|comprar/.test(action));
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
      var content = { id: String(product.id), name: product.name ? String(product.name) : undefined, content_type: "product" };
      var productEvent = {
        type: "contents",
        contents: [content]
      };
      var variant = currentVariant();
      var variantAmount = variant ? Number(variant.price_number_raw) : NaN;
      if (Number.isFinite(variantAmount) && variantAmount >= 0) {
        productEvent.amount = Math.round(variantAmount);
        productEvent.currency = currency();
        content.amount = Math.round(variantAmount);
        content.currency = currency();
      }
      measure("contents_viewed", productEvent);
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
    var lastCheckoutAt = 0;
    var lastAddWatchAt = 0;
    var addWatchId = 0;
    function checkoutStarted() {
      var now = Date.now();
      if (now - lastCheckoutAt < 3000) return;
      lastCheckoutAt = now;
      measure("checkout_started", cartData());
    }
    function cartWidgetCount() {
      var node = d.querySelector(".js-cart-widget-amount, [data-component=cart-count]");
      var value = node ? String(node.textContent || "").replace(/[^0-9]/g, "") : "";
      return value ? Number(value) : 0;
    }
    function clickedItemData(form) {
      if (!form || typeof form.querySelector !== "function") return null;
      var idInput = form.querySelector('[name="add_to_cart"]');
      var id = idInput && idInput.value != null ? String(idInput.value) : "";
      if (!id) return null;
      var quantityInput = form.querySelector('.js-quantity-input, [name="quantity"]');
      var quantity = Math.max(1, Number(quantityInput && quantityInput.value || 1));
      var container = form.closest ? form.closest(".js-product-container") : null;
      var nameNode = container && container.querySelector
        ? container.querySelector(".js-product-name, .js-item-name")
        : null;
      var product = ls().product || {};
      var name = nameNode && nameNode.textContent
        ? String(nameNode.textContent).trim()
        : (product.name ? String(product.name) : undefined);
      var item = { id: id, name: name, content_type: "product", quantity: quantity };
      var data = { type: "contents", contents: [item] };
      var variant = currentVariant();
      var unit = variant ? Number(variant.price_number_raw) : NaN;
      if (Number.isFinite(unit) && unit >= 0) {
        item.amount = Math.round(unit);
        item.currency = currency();
        data.amount = Math.round(unit * quantity);
        data.currency = currency();
      }
      return data;
    }
    function watchItemsAdded(form) {
      var now = Date.now();
      if (now - lastAddWatchAt < 1000) return;
      lastAddWatchAt = now;
      var watchId = ++addWatchId;
      var completed = false;
      var before = cartSnapshot();
      var beforeWidgetCount = cartWidgetCount();
      var clickedItem = clickedItemData(form);
      safeSet("openai_ads_cart_before_add", JSON.stringify(before));
      function check(finalCheck) {
        if (completed || watchId !== addWatchId) return;
        if (detectItemsAdded(before, false)) {
          completed = true;
          return;
        }
        if (clickedItem && cartWidgetCount() > beforeWidgetCount) {
          measure("items_added", clickedItem);
          safeRemove("openai_ads_cart_before_add");
          completed = true;
          return;
        }
        if (finalCheck) {
          detectItemsAdded(before, true);
          completed = true;
        }
      }
      w.setTimeout(function () { check(false); }, 400);
      w.setTimeout(function () { check(false); }, 1200);
      w.setTimeout(function () { check(false); }, 2500);
      w.setTimeout(function () { check(true); }, 5000);
    }
    d.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || typeof form.getAttribute !== "function") return;
      var action = String(form.getAttribute("action") || "").toLowerCase();
      var submitter = event.submitter || d.activeElement;
      if (action.indexOf("checkout") >= 0 || isCheckoutControl(submitter)) checkoutStarted();
      if (isAddToCart(form, submitter)) watchItemsAdded(form);
    }, true);
    d.addEventListener("click", function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest('a[href*="checkout"], button[data-action*="checkout"], [name="go_to_checkout"], [data-component="cart.checkout-button"]')
        : null;
      if (target || isCheckoutControl(event.target)) checkoutStarted();
      var addTarget = event.target && event.target.closest
        ? event.target.closest('[data-component="product.add-to-cart"], .js-addtocart')
        : null;
      var addForm = addTarget && addTarget.closest ? addTarget.closest("form") : null;
      if (addTarget && isAddToCart(addForm, addTarget)) watchItemsAdded(addForm);
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

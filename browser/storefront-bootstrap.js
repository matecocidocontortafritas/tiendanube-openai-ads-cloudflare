(function (w, d) {
  "use strict";
  var currentScript = d.currentScript;
  var sourceStoreId = "";
  var workerOrigin = "";
  try {
    var scriptUrl = currentScript ? new URL(currentScript.src) : null;
    sourceStoreId = scriptUrl ? scriptUrl.searchParams.get("store") || "" : "";
    workerOrigin = scriptUrl ? scriptUrl.searchParams.get("worker") || "" : "";
  } catch (_) {
    sourceStoreId = "";
    workerOrigin = "";
  }
  var runtimeStoreId = w.LS && w.LS.store && w.LS.store.id != null
    ? String(w.LS.store.id)
    : "";
  var storeId = sourceStoreId || runtimeStoreId;
  if (!/^\d+$/.test(storeId)) return;
  if (!/^https:\/\//.test(workerOrigin)) return;
  if (w.__openAIAdsTiendanubeBootstrap) return;
  w.__openAIAdsTiendanubeBootstrap = true;
  var script = d.createElement("script");
  script.async = true;
  script.src = workerOrigin.replace(/\/$/, "") + "/pixel/storefront.js?store_id=" + encodeURIComponent(storeId);
  (d.head || d.documentElement).appendChild(script);
})(window, document);

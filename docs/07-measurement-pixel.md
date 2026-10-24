# 7. Measurement Pixel en el navegador

## En simple

El Script de Tiendanube carga un JavaScript generado por el Worker. Ese JavaScript sabe qué Pixel corresponde a la tienda, escucha acciones comerciales y se comunica con OpenAI desde el navegador.

## Eventos implementados

| Evento | Cuándo se intenta medir |
|---|---|
| `page_viewed` | al inicializar en una página del storefront |
| `contents_viewed` | cuando `LS.product` identifica un producto |
| `items_added` | cuando se detecta un aumento real del carrito después del submit |
| `checkout_started` | al enviar o pulsar un control de checkout |
| `order_created` | sólo si el runtime donde corre el Pixel expone `LS.order.id` |

Tiendanube documenta los importes de `LS.cart` y `LS.order` en centavos/unidades menores. El código los envía como enteros sin volver a multiplicarlos.

## Carga por tienda

El Script Partner recibe:

```text
...?store=123456&worker=https%3A%2F%2Fopenai-conversions.example.com
```

El bootstrap valida el `store_id` y exige un Worker HTTPS. Luego carga:

```text
https://openai-conversions.example.com/pixel/storefront.js?store_id=123456
```

El Worker responde `404` si la tienda no está habilitada y `503` si el Pixel Secret no existe.

## Consentimiento

Antes de cargar el script podés definir:

```js
window.openAIAdsMeasurementConsent = false;
```

Después de que el usuario acepte medición:

```js
window.OpenAIAdsTiendanube.setConsent(true);
```

Al revocar:

```js
window.OpenAIAdsTiendanube.setConsent(false);
```

La política de consentimiento debe integrarse con la CMP/banner real de la tienda. El valor por defecto del ejemplo no constituye asesoramiento legal y puede requerir cambio según jurisdicción.

## `oppref` y `obref`

El Pixel oficial administra sus cookies de atribución cuando tiene consentimiento. El wrapper también conserva temporalmente referencias para intentar transferirlas a la orden mediante inputs `extra[...]`.

Limitaciones:

- el tema debe tener un formulario compatible;
- el checkout puede vivir en un contexto distinto;
- `__obref` sólo existe después de que el Pixel oficial la cree;
- bloqueadores o políticas de cookies pueden impedirlo;
- si no se puede persistir, CAPI seguirá enviando la compra pero sin esa referencia.

## Compra browser-side y NubeSDK

Ésta es la limitación más importante del proyecto.

Tiendanube está migrando los scripts de checkout a **NubeSDK**. NubeSDK ejecuta la app en un Web Worker y ofrece `order:update` en la página de éxito, además de `order:add:extra`. Sin embargo, el Measurement Pixel web de OpenAI presupone APIs del navegador principal (`window`, cookies y carga del SDK). No debe fingirse que un script de storefront clásico cubre automáticamente el checkout nuevo.

Por eso:

- `checkout_started` puede medirse desde el storefront justo antes de navegar;
- `order_created` server-side mediante CAPI sí está cubierto;
- `order_created` browser-side sólo debe declararse activo después de probar que el Script corre en la página de éxito compatible;
- para NubeSDK puro se necesita una adaptación oficialmente compatible con el SDK de OpenAI o una solución aprobada por ambas plataformas. Enviar desde NubeSDK al Worker sería otro evento server-side, no un evento `pixel_sdk`.

No publiques “Pixel de compra funcionando” basándote únicamente en que el Script figura `active` en la API.

## Prueba en Chrome

1. abrir una ventana incógnita o perfil limpio;
2. aceptar o rechazar consentimiento según el caso;
3. interactuar si el Script usa `onfirstinteraction`;
4. DevTools → Network;
5. filtrar por `apps-scripts.tiendanube.com`, `pixel/storefront.js`, `bzrcdn` y `bzr.openai.com`;
6. ejecutar en Console:

```js
({
  bootstrap: Boolean(window.__openAIAdsTiendanubeBootstrap),
  pixel: Boolean(window.__openAIAdsTiendanubeLoaded),
  api: Boolean(window.OpenAIAdsTiendanube),
  store: window.LS?.store?.id
})
```

7. navegar home → producto → agregar → checkout;
8. confirmar un solo evento lógico por acción;
9. repetir con consentimiento denegado.

## `onfirstinteraction` versus `onload`

`onfirstinteraction` es el valor inicial más conservador, pero el primer `page_viewed` se demora hasta scroll, click o tap. Tiendanube exige aprobación previa para ciertos Scripts `onload`. Documentá el motivo de medición, App ID y nombre de la app al solicitarla.

## Fuentes oficiales

- [OpenAI Measurement Pixel](https://developers.openai.com/ads/measurement-pixel)
- [OpenAI Supported Events](https://developers.openai.com/ads/supported-events)
- [Tiendanube Scripts](https://tiendanube.github.io/api-documentation/resources/script)
- [NubeSDK Order Events](https://dev.tiendanube.com/pt/docs/applications/nube-sdk/events/order)

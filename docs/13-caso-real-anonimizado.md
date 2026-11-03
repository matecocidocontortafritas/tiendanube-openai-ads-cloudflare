# 13. Caso real anonimizado

Este capítulo resume una instalación real realizada de forma asistida, sin publicar secretos ni identificadores del cliente.

## Objetivo

Conectar una tienda Tiendanube con:

- Measurement Pixel en browser;
- webhook `order/paid`;
- Cloudflare Worker + D1 + Queue + DLQ;
- OpenAI Conversions API en `validate_only`;
- deduplicación `tn_order_<ORDER_ID>`.

## Secuencia ejecutada

1. se creó un Worker bajo un subdominio dedicado del dominio del cliente;
2. se creó D1 y se aplicaron migraciones;
3. se crearon Queue y DLQ;
4. se cargaron Secrets sin incorporarlos al código;
5. se creó una app Tiendanube Partner con `read_orders` y `write_scripts`;
6. se configuró OAuth y se instaló la app en una tienda autorizada;
7. el token de instalación se cifró en D1;
8. se registró `order/paid`;
9. se creó una fuente/Pixel de OpenAI Ads y una CAPI key;
10. se creó un Script Partner no autoinstalable;
11. se publicó una versión `onfirstinteraction`;
12. el Worker creó y luego refrescó la asociación Script/tienda;
13. se ejecutaron tests y typecheck;
14. se probó la tienda con una sesión limpia de Chrome.

## Hallazgos reales y resolución

La primera revisión terminó correctamente en “todavía no operativo”: el portal y la API mostraban el Script activo y asociado, pero Chrome no descargaba su archivo. Se preparó evidencia para Partner Support sin publicar credenciales ni datos del cliente.

En una revisión posterior el Script sí apareció en la tienda publicada. La validación completa reveló cuatro problemas que una pantalla “active” no permite detectar:

1. la versión publicada cargaba una ruta histórica `/pixel/<client_key>.js`, que respondía `404`;
2. `onfirstinteraction` demoraba la descarga hasta el primer click, tap o scroll;
3. la vista previa y la tienda publicada usaban temas distintos;
4. el tema publicado agregaba al carrito por AJAX, cancelaba el submit nativo y no actualizaba `LS.cart` de inmediato.

Se agregó una ruta de compatibilidad que resuelve el cliente de forma exacta en D1 y vuelve a aplicar el aislamiento por tienda, sin fallback entre clientes. Para el carrito se combinó el click del control con una comprobación del aumento real del contador y datos estructurados de producto/variante.

Después del despliegue se observaron en el Event Stream real:

- `page_viewed`;
- `contents_viewed` con producto, moneda e importe;
- `items_added` con producto, cantidad, moneda e importe;
- `checkout_started` con subtotal completo y contenido del carrito.

La prueba se detuvo en el primer paso del checkout. No se ingresaron datos personales ni se realizó un pago. `order_created` por CAPI continúa en `validate_only` hasta disponer de una orden pagada controlada. La compra por Pixel tampoco se declara operativa hasta verla en el runtime real de la página de éxito.

## Aprendizajes

- “active” en una API no prueba entrega en storefront;
- verificar con navegador limpio, red y DOM;
- probar Chrome si Safari queda inestable;
- no lanzar campañas hasta observar eventos reales;
- separar limitaciones de plataforma de errores de código;
- rotar inmediatamente cualquier clave que aparezca en una captura o salida accesible;
- documentar el límite entre Script clásico y NubeSDK checkout;
- mantener CAPI en `validate_only` hasta que haya una orden pagada controlada.
- crear las definiciones de conversión no exige campañas activas;
- los eventos de valor pueden probarse antes de lanzar campañas, pero su uso posterior depende de las funciones disponibles en Ads Manager.

## Evidencia mínima para cerrar una instalación

```text
[ ] Worker /health = ok
[ ] OAuth app+store activo
[ ] webhook order/paid registrado
[ ] Script descargado realmente en Chrome
[ ] eventos browser recibidos por OpenAI (`page_viewed`, `contents_viewed`, `items_added`, `checkout_started`)
[ ] CAPI validate_only aceptada
[ ] CAPI real recibida
[ ] Pixel y CAPI comparten tn_order_<ORDER_ID>
[ ] orden no se cuenta dos veces
```

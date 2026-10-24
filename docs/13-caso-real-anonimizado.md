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

## Hallazgo real

El portal y la API de Tiendanube informaban:

- Script activo;
- versión correcta;
- asociación existente;
- instalación automática desactivada según diseño.

Sin embargo, Chrome no recibió el archivo del Script. Otros Scripts de la tienda sí aparecían en Network, pero no el nuevo. Tampoco existían los objetos globales del bootstrap/Pixel.

Conclusión correcta: la infraestructura y la asociación estaban configuradas, pero el Pixel browser-side **no estaba operativo**. Se preparó un ticket a Partner Support con App ID, Script ID, Store ID, versión, URL y timestamp.

## Aprendizajes

- “active” en una API no prueba entrega en storefront;
- verificar con navegador limpio, red y DOM;
- probar Chrome si Safari queda inestable;
- no lanzar campañas hasta observar eventos reales;
- separar limitaciones de plataforma de errores de código;
- rotar inmediatamente cualquier clave que aparezca en una captura o salida accesible;
- documentar el límite entre Script clásico y NubeSDK checkout;
- mantener CAPI en `validate_only` hasta que haya una orden pagada controlada.

## Evidencia mínima para cerrar una instalación

```text
[ ] Worker /health = ok
[ ] OAuth app+store activo
[ ] webhook order/paid registrado
[ ] Script descargado realmente en Chrome
[ ] eventos browser recibidos por OpenAI
[ ] CAPI validate_only aceptada
[ ] CAPI real recibida
[ ] Pixel y CAPI comparten tn_order_<ORDER_ID>
[ ] orden no se cuenta dos veces
```

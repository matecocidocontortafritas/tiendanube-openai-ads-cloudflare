# 12. Troubleshooting

## El Script figura activo pero no aparece en la tienda

Síntomas:

- API devuelve `status: active` y `current_version`;
- asociación `POST`/`PUT` responde correctamente;
- Chrome no descarga el archivo de `apps-scripts.tiendanube.com`;
- no existen `__openAIAdsTiendanubeBootstrap` ni `OpenAIAdsTiendanube`.

Acciones:

1. probar perfil limpio de Chrome;
2. generar la primera interacción si usa `onfirstinteraction`;
3. comprobar que la app instalada es dueña del Script;
4. comprobar scope `write_scripts` y reinstalación posterior al cambio;
5. comprobar que no está en dev mode o con versión draft equivocada;
6. refrescar asociación mediante `/ops/associate-storefront-script`;
7. esperar una propagación razonable y volver a probar;
8. abrir ticket Partner con App ID, Script ID, Store ID, versión, URL solicitada, timestamp y captura de Network.

No afirmar que el Pixel está instalado sólo porque el portal dice “activo”.

## Safari se congela o muestra estado inconsistente

Usar Chrome con perfil limpio o una sesión aislada. Deshabilitar extensiones, cerrar DevTools pesadas y repetir la prueba. El resultado válido es la evidencia de red/DOM, no el navegador elegido.

## `401 invalid_signature` en webhook

- verificar app secret de la misma app instalada;
- firmar el body crudo exacto;
- no modificar espacios, encoding ni saltos después de firmar;
- usar el header `x-linkedstore-hmac-sha256`;
- verificar que un proxy no transforme el body.

## `403 unknown_store`

La tienda no existe en `stores`. Insertar la fila antes de habilitar webhooks productivos. No aceptar cualquier `store_id` automáticamente: eso rompería el aislamiento.

## `/pixel/storefront.js` devuelve `404 store_not_enabled`

Comprobar `enabled=1` y que el `store_id` de la URL sea el correcto.

## `/pixel/storefront.js` devuelve `503 pixel_not_configured`

- revisar `pixel_secret_slot` en D1;
- el nombre debe comenzar con `OPENAI_PIXEL_ID_`;
- cargar un Secret con exactamente ese nombre;
- verificar que se cargó en el Worker/ambiente correcto.

## No aparecen eventos browser

- falta consentimiento;
- no hubo primera interacción;
- bloqueador de anuncios/privacidad;
- CSP o red bloquea `bzrcdn.openai.com`/`bzr.openai.com`;
- el Script no fue entregado;
- el Pixel ID pertenece a otra fuente;
- el evento ocurre en checkout/NubeSDK y el script clásico no está presente.

## Importes 100 veces mayores o menores

OpenAI espera unidades menores. Tiendanube `LS.cart`/`LS.order` ya expone importes en centavos para el Script clásico; la Order API suele entregar decimales que el Worker convierte. No aplicar la misma conversión a ambos orígenes.

## CAPI devuelve `400`

Activar `validate_only`, leer el código de error sanitizado y revisar:

- evento estándar exacto;
- `data.type` compatible;
- amount entero;
- currency ISO 4217;
- timestamp en milisegundos y dentro de la ventana aceptada;
- arrays de user data con hashing/formato correcto;
- campos no soportados dentro de `contents[]`.

No registrar el payload completo para diagnosticar producción.

## CAPI devuelve `401` o `403`

La CAPI key puede estar revocada, pertenecer a otra cuenta o haberse usado como Advertiser API key. Rotar sólo después de confirmar el ad account y Pixel fuente.

## `validated` no aparece en Event Stream

Es esperado: `validate_only: true` no guarda eventos. Cambiar a real sólo después de validar y con autorización.

## Recent Events devuelve `404 Not found`

El endpoint puede no estar habilitado para esa cuenta. Además requiere Advertiser API key, no CAPI key. Usar Ads Manager o contactar al representante.

## Evento duplicado o falta deduplicación

Comprobar que ambos caminos usan:

```text
pixel_id idéntico
event name = order_created
Pixel event_id = tn_order_<ID>
CAPI id = tn_order_<ID>
```

Si el browser usa número visible y CAPI usa ID interno, no coincidirán.

## Orden queda en `retrying`

Consultar `last_http_status`, `last_error_code` y `attempt_count`. `429`/`5xx` deberían reintentar. Si agotó intentos, revisar DLQ antes de reproducir manualmente.

## OAuth vuelve con `code=null` o pide login Partner

Comprobar Redirect URL personalizada. El callback por defecto del portal Partner no es el callback de tu Worker. En reinstalaciones, el `code` debe capturarse desde la URL de redirección real.

## `order.extra` no contiene atribución

El tema/checkout puede no aceptar los inputs `extra[...]`, el usuario puede no haber consentido o NubeSDK puede requerir `order:add:extra`. No inventar `oppref`/`obref`; registrar la limitación y enviar la compra sin esos campos.

## Un deploy revirtió variables o rutas

Wrangler trata su archivo de configuración como fuente de verdad. Si editaste vars/rutas sólo en Dashboard, el siguiente deploy puede sobrescribirlas. Replicar cambios en el `wrangler.jsonc` operativo ignorado por Git.

## Migraciones no se aplican

```bash
npx wrangler d1 migrations list tiendanube-openai-ads --remote
npx wrangler d1 migrations apply tiendanube-openai-ads --remote
```

Confirmar que el nombre/ID del D1 corresponde al ambiente correcto. No ejecutar SQL destructivo para “empezar de cero” en producción.

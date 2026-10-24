# 9. Testing y lanzamiento

No saltes directamente a producción. Cada capa debe demostrar que funciona.

## Fase 1: código local

```bash
npm ci
npm test
npm run typecheck
```

Los tests actuales cubren unidades menores, schema de `order_created`, ID determinístico, consentimiento para atribución y rechazo de órdenes inválidas. Agregá fixtures anonimizados de tu integración sin copiar PII real.

## Fase 2: infraestructura

```bash
curl -fsS https://openai-conversions.example.com/health
npx wrangler d1 migrations list tiendanube-openai-ads --remote
```

Verificá que D1 y Queue estén vinculados a la cuenta y ambiente correctos.

## Fase 3: instalación Tiendanube

Confirmá:

- fila de `stores` con `enabled=1`, `validate_only=1`;
- instalación OAuth activa;
- scopes esperados;
- webhook `order/paid` registrado;
- Script `active` y asociado.

No inspecciones el token cifrado salvo para diagnosticar corrupción; nunca intentes imprimir el token descifrado.

## Fase 4: Pixel en Chrome

Usá un perfil limpio y DevTools, siguiendo [Measurement Pixel](07-measurement-pixel.md). Para cada evento anotá:

| Caso | Acción | Resultado |
|---|---|---|
| consentimiento denegado | navegar/agregar | no enviar medición |
| page | cargar e interactuar | un `page_viewed` |
| product | abrir producto | un `contents_viewed` |
| cart | agregar una unidad | un `items_added` con delta 1 |
| checkout | iniciar checkout | un `checkout_started` |
| success compatible | completar orden | `order_created` con `tn_order_<ID>` |

Separá “el script fue descargado” de “OpenAI recibió el evento”. Son comprobaciones distintas.

## Fase 5: CAPI con `validate_only`

Elegí una orden real de prueba que figure pagada y ejecutá:

```bash
read -s OPERATOR_TEST_TOKEN
export OPERATOR_TEST_TOKEN

curl -i https://openai-conversions.example.com/ops/replay-order \
  -H "authorization: Bearer $OPERATOR_TEST_TOKEN" \
  -H 'content-type: application/json' \
  --data '{"store_id":"123456","order_id":"987654321"}'
```

Consultar estado:

```bash
curl -sS \
  'https://openai-conversions.example.com/ops/order-status?order_id=987654321' \
  -H "authorization: Bearer $OPERATOR_TEST_TOKEN"
```

Esperado:

```text
state=validated
validate_only=1
last_http_status=2xx
```

Un request `validate_only` exitoso valida el payload, pero no guarda el evento y no aparece en Event Stream.

## Fase 6: primer evento real

Después de revisar total, moneda, productos, timestamp y matching:

```bash
npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"UPDATE stores SET validate_only = 0, updated_at = CURRENT_TIMESTAMP
 WHERE store_id = '123456';"
```

Repetí el replay de esa orden. Como la validación no guardó el evento, el proyecto permite pasar de `validated` a envío real conservando el mismo ID.

Esperado:

```text
state=delivered
validate_only=0
last_http_status=2xx
```

## Fase 7: confirmar recepción

Usá Event Stream de Ads Manager o, si la cuenta tiene Advertiser API:

```bash
curl -G 'https://api.ads.openai.com/v1/conversions/events' \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "pid=$OPENAI_PIXEL_ID" \
  --data-urlencode 'limit=50'
```

Comprobá canal:

- browser: `pixel_sdk`;
- CAPI: `server_to_server`.

## Fase 8: monitoreo

```bash
npx wrangler tail tiendanube-openai-ads

npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"SELECT event_id,state,attempt_count,last_http_status,last_error_code,updated_at
 FROM deliveries ORDER BY updated_at DESC LIMIT 20;"
```

Revisá DLQ, `permanent_failure`, aumentos de `429`, fallas de OAuth y solicitudes de privacidad.

## Go-live checklist

- [ ] documentación oficial revisada nuevamente;
- [ ] consentimiento aprobado por responsable legal/privacidad;
- [ ] Pixel probado en Chrome limpio y móvil;
- [ ] límites de checkout documentados;
- [ ] CAPI validada con orden real;
- [ ] un evento real confirmado en OpenAI;
- [ ] deduplicación verificada con mismo ID;
- [ ] Secrets no aparecen en Git ni logs;
- [ ] rotación y responsables documentados;
- [ ] alertas/DLQ operativas;
- [ ] rollback definido: `enabled=0` o `validate_only=1`.

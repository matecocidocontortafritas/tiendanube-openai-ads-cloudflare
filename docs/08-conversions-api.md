# 8. Conversions API y webhook de compra

## En simple

Tiendanube avisa “la orden 123 se pagó”. El Worker no confía ciegamente: verifica que el aviso sea auténtico, consulta la orden, reconfirma `paid`, arma el evento y lo manda a OpenAI.

## Webhook esperado

```json
{
  "store_id": 123456,
  "event": "order/paid",
  "id": 987654321
}
```

El Worker limita el body a 32 KiB y valida el header:

```text
x-linkedstore-hmac-sha256
```

La firma se calcula sobre el body **crudo** usando el app secret. Parsear y volver a serializar antes de verificar puede modificar bytes y romper la validación.

## Idempotencia

Se usan dos niveles:

1. `webhook_receipts`: hash de `store_id:order/paid:order_id`;
2. `deliveries`: `event_id = tn_order_<ORDER_ID>` con restricción única.

Un retry de Tiendanube, Queue u OpenAI no crea una conversión nueva.

## Consulta de orden

El consumer usa el token OAuth cifrado de esa tienda para solicitar:

```text
GET https://api.tiendanube.com/2025-03/<STORE_ID>/orders/<ORDER_ID>
```

Requisitos para continuar:

- la instalación existe y está activa;
- el token se descifra con el contexto app + tienda correcto;
- la respuesta es válida;
- `payment_status` es exactamente `paid`;
- `paid_at` es válido y aceptado por la ventana temporal de OpenAI;
- total y moneda son válidos.

## Transformación

Ejemplo conceptual:

```json
{
  "validate_only": true,
  "integration_source": "community_tiendanube_cloudflare",
  "events": [
    {
      "id": "tn_order_987654321",
      "type": "order_created",
      "timestamp_ms": 1792860000000,
      "action_source": "web",
      "source_url": "https://www.demo.com",
      "data": {
        "type": "contents",
        "amount": 159800,
        "currency": "ARS",
        "contents": [
          {
            "id": "SKU-1",
            "content_type": "product",
            "quantity": 2,
            "amount": 79900,
            "currency": "ARS"
          }
        ]
      }
    }
  ]
}
```

No copiar este timestamp ni estos IDs: el Worker usa los valores reales de la orden.

## Customer matching

Cuando están presentes y permitidos, el proyecto normaliza y hashea con SHA-256:

- emails;
- teléfonos;
- customer external ID;
- nombre y apellido.

Región, ciudad, código postal, país, IP, user agent y `obref` se tratan conforme al schema correspondiente. No se escriben valores crudos en logs ni en tablas de entrega.

## Envío

```http
POST https://bzr.openai.com/v1/events?pid=<PIXEL_ID>
Authorization: Bearer <CAPI_KEY>
Content-Type: application/json
```

La CAPI key se resuelve desde el slot configurado para esa tienda. Nunca se obtiene de un request del navegador.

## Reintentos

Son reintentables:

- fallas de red;
- `408`;
- `425`;
- `429`;
- `5xx`.

Otros `4xx`, schema inválido, orden no pagada o configuración incorrecta se registran como fallo permanente. Los mensajes que agotan retries llegan a la DLQ.

## Estados operativos

```text
pending → validating → validated
pending → sending → delivered
                 ↘ retrying
                 ↘ permanent_failure
```

Los estados dependen de `validate_only`:

- `1`: éxito significa `validated`;
- `0`: éxito significa `delivered`.

## Prueba manual firmada

Usar un ID de orden real y un entorno controlado. El app secret debe estar disponible sólo en una sesión segura:

```bash
body='{"store_id":123456,"event":"order/paid","id":987654321}'
signature="$(printf %s "$body" | openssl dgst -sha256 -hmac "$TIENDANUBE_APP_SECRET" -hex | awk '{print $2}')"

curl -i https://openai-conversions.example.com/webhooks/tiendanube/order-paid \
  -H 'content-type: application/json' \
  -H "x-linkedstore-hmac-sha256: $signature" \
  --data "$body"
```

Preferí un webhook real o un entorno local. No pegues el app secret en documentación ni guardes el comando con su valor expandido.

## Fuente oficial

- [OpenAI Conversions API](https://developers.openai.com/ads/conversions-api)
- [Tiendanube Webhooks](https://tiendanube.github.io/api-documentation/resources/webhook)
- [Tiendanube Orders](https://tiendanube.github.io/api-documentation/resources/order)

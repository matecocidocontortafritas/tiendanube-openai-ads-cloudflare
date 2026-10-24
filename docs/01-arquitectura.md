# 1. Arquitectura y decisiones

## En simple

Hay dos mensajeros:

- el **Pixel** vive en el navegador y observa páginas, productos, carrito y checkout;
- la **CAPI** vive en el servidor y espera la confirmación de pago de Tiendanube.

Usar solamente el Pixel deja la medición expuesta a bloqueadores, cierres de pestaña y fallas del navegador. Usar solamente CAPI confirma compras, pero pierde parte del recorrido previo. Juntos dan una medición más completa.

## Componentes

| Componente | Responsabilidad | Datos sensibles |
|---|---|---|
| Script Partner | Cargar el JS de la tienda correcta | No contiene CAPI key |
| Measurement Pixel | Enviar eventos del navegador | Pixel ID público; cookies sujetas a consentimiento |
| Worker | OAuth, webhooks, API Tiendanube y CAPI | Accede a Secrets en runtime |
| D1 | Configuración, deduplicación y estado | Token OAuth cifrado; no guarda la orden completa |
| Queue | Sacar el trabajo lento del webhook | IDs operativos, no PII |
| DLQ | Retener mensajes que agotaron reintentos | Mismo payload operativo de Queue |

## Flujo browser

1. Tiendanube carga el Script Partner asociado a la tienda.
2. El script recibe `store=<STORE_ID>` y `worker=<PUBLIC_BASE_URL>` como query parameters.
3. Carga `/pixel/storefront.js?store_id=<STORE_ID>`.
4. El Worker busca la tienda habilitada en D1 y obtiene su Pixel ID del Secret indicado por `pixel_secret_slot`.
5. El navegador inicializa `oaiq` y mide eventos sólo si hay consentimiento.

La CAPI key jamás se serializa en ese JavaScript.

## Flujo servidor

1. Tiendanube envía `order/paid`.
2. El Worker lee el body crudo, limita su tamaño y valida el HMAC.
3. Calcula una clave idempotente con tienda, tópico e ID de orden.
4. Inserta el recibo en D1. Si ya existe, responde como duplicado sin volver a procesarlo.
5. Encola el trabajo y responde `202` rápidamente.
6. El consumer descifra el token OAuth de esa tienda y consulta la orden completa.
7. Reconfirma `payment_status === "paid"`.
8. Transforma importes a unidades menores ISO 4217 y genera `tn_order_<ORDER_ID>`.
9. Envía el evento a `https://bzr.openai.com/v1/events?pid=<PIXEL_ID>`.
10. Registra estado, intento, HTTP status y código de error, sin persistir PII.

## Deduplicación Pixel + CAPI

OpenAI deduplica por la combinación de Pixel ID, nombre del evento y event ID. Para una compra:

```text
Pixel event name:  order_created
Pixel event_id:    tn_order_123456
CAPI type:         order_created
CAPI id:           tn_order_123456
Pixel ID:          el mismo en ambos caminos
```

No generar UUID separados. Los retries de CAPI también deben conservar el mismo ID.

## Por qué `order/paid`

Una orden creada todavía puede quedar pendiente o abandonada. El webhook específico `order/paid` reduce notificaciones irrelevantes. Igual se consulta la orden y se reconfirma el estado antes de enviar la conversión.

## Decisiones que deben adaptarse

- política de consentimiento por país;
- origen canónico de la tienda;
- forma de persistir `oppref` y `obref` hasta la orden;
- compatibilidad del tema/checkout con `extra[...]`;
- retención de D1 y procedimiento de privacidad;
- cantidad de retries y alertas sobre DLQ;
- autorización de operadores para endpoints `/ops/*`.

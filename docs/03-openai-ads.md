# 3. Preparar OpenAI Ads

## En simple

Vas a crear una “fuente de datos” para la tienda. Esa fuente entrega un Pixel ID. Después generás una llave privada para que el Worker pueda enviar conversiones confirmadas.

## 1. Verificar acceso

Entrá a Ads Manager y buscá el área de conversiones o fuentes de datos. Si no está disponible, detené la instalación y solicitá habilitación. No sirve una API key común de la plataforma de modelos de OpenAI.

## 2. Crear la fuente/Pixel

Creá una fuente web con un nombre identificable, por ejemplo:

```text
Tienda Example — producción
```

Guardá por separado:

- el `pixel_id`, usado por Pixel y CAPI;
- el ID interno de la fuente, si la interfaz o Advertiser API lo muestra.

El Pixel ID puede aparecer en el JavaScript del navegador. No es una credencial secreta.

## 3. Crear la Conversions API key

Generá una CAPI key vinculada al mismo ad account/fuente. Muchas interfaces muestran el valor completo una sola vez.

Ceremonia segura:

1. abrir dos ventanas: Ads Manager y una terminal con `npx wrangler secret put ...`;
2. copiar el valor y pegarlo directamente en el prompt protegido;
3. comprobar que Wrangler confirme la carga;
4. limpiar el portapapeles;
5. cerrar el modal que mostraba la clave;
6. nunca guardar la clave en README, tickets, notas o capturas.

Nombre recomendado del Secret para un cliente `DEMO`:

```text
OPENAI_CAPI_KEY_DEMO
```

El Pixel ID correspondiente se guarda también como Secret por consistencia operativa:

```text
OPENAI_PIXEL_ID_DEMO
```

## 4. Eventos estándar usados

| Acción comercial | Evento OpenAI | Data type |
|---|---|---|
| Ver página | `page_viewed` | `contents` |
| Ver producto/contenido | `contents_viewed` | `contents` |
| Agregar al carrito | `items_added` | `contents` |
| Iniciar checkout | `checkout_started` | `contents` |
| Compra confirmada | `order_created` | `contents` |

No renombrar la compra a `purchase`. OpenAI define `order_created` para este caso.

## 5. Importes

Los importes se envían como enteros en la unidad menor de la moneda:

```text
ARS 1.234,56 → 123456
USD 89,00     → 8900
JPY 8.900     → 8900
```

`contents[].amount` representa el precio de **una unidad**; `quantity` se envía aparte. `data.amount` representa el total del evento.

## 6. Atribución y matching

- `oppref`: referencia del click; el Pixel la captura desde la URL. CAPI debe preservarla explícitamente cuando esté disponible.
- `obref`: referencia del navegador almacenada por el Pixel en `__obref`; puede enviarse como `user.obref`.
- información de cliente permitida: debe normalizarse y hashearse según la guía oficial antes de CAPI.
- IP y user agent: sólo enviar cuando la API y la política aplicable lo permitan.

Este proyecto intenta persistir referencias en `order.extra`, pero Tiendanube y el tema deben permitir los inputs `extra[...]`. Si no ocurre, no se simula atribución: CAPI enviará la compra sin esos identificadores.

## 7. `validate_only`

La primera etapa usa:

```json
{
  "validate_only": true,
  "events": []
}
```

OpenAI valida el schema sin guardar los eventos. Es normal que esos requests no aparezcan en el stream de eventos recientes. Sólo cambiar a `false` después de una validación exitosa.

## 8. Advertiser API key opcional

Para consultar eventos recientes por API se usa una Advertiser API key, no la CAPI key:

```bash
curl -G 'https://api.ads.openai.com/v1/conversions/events' \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "pid=$OPENAI_PIXEL_ID" \
  --data-urlencode 'limit=50'
```

El resultado es una muestra reciente —aproximadamente los últimos 15 minutos— para troubleshooting, no un reporte histórico de atribución.

## Fuentes oficiales

- [Conversion tracking](https://developers.openai.com/ads/conversion-tracking)
- [Measurement Pixel](https://developers.openai.com/ads/measurement-pixel)
- [Conversions API](https://developers.openai.com/ads/conversions-api)
- [Supported Events](https://developers.openai.com/ads/supported-events)

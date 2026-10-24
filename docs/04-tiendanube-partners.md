# 4. Crear la app en Tiendanube Partners

## En simple

La app es el permiso formal que une la tienda con tu Worker. El merchant acepta la instalación; Tiendanube devuelve un token para esa tienda; el Worker crea el webhook y autoriza el Script.

## 1. Crear la aplicación

En el portal de Tiendanube Partners, crear una app con un nombre claro, por ejemplo:

```text
OpenAI Ads Measurement
```

Completar contacto técnico, descripción, distribución y URLs solicitadas. Para una prueba controlada, mantenerla en modo desarrollo y limitar la distribución a las tiendas necesarias.

## 2. Permisos mínimos

Habilitar:

```text
read_orders
write_scripts
```

`read_orders` permite obtener total, moneda, productos, cliente permitido y estado de pago. `write_scripts` permite asociar el Script a la tienda. No hace falta `write_orders` para esta integración.

Si modificás los permisos después de instalar, reinstalá la app. El OAuth URL no agrega scopes dinámicamente.

## 3. URLs

Con `PUBLIC_BASE_URL=https://openai-conversions.example.com`:

| Uso | URL |
|---|---|
| Instalación | `https://openai-conversions.example.com/tiendanube/install` |
| OAuth callback | `https://openai-conversions.example.com/tiendanube/oauth/callback` |
| Order paid | `https://openai-conversions.example.com/webhooks/tiendanube/order-paid` |
| Store redact | `https://openai-conversions.example.com/webhooks/tiendanube/privacy/store-redact` |
| Customer redact | `https://openai-conversions.example.com/webhooks/tiendanube/privacy/customer-redact` |
| Data request | `https://openai-conversions.example.com/webhooks/tiendanube/privacy/customers-data-request` |

El callback configurado en Partners debe coincidir exactamente con el Worker. El Worker genera y valida `state` OAuth y lo guarda temporalmente hasheado.

## 4. App secret

Copiar el app secret directamente a Cloudflare:

```bash
npx wrangler secret put TIENDANUBE_APP_SECRET
```

No confundir app secret con el access token de una tienda. El app secret valida webhooks y participa del intercambio OAuth; el access token pertenece a una instalación específica y se guarda cifrado en D1.

## 5. Crear el Script Partner

En la app, crear un Script con:

- ubicación: `store` para el storefront;
- evento inicial: `onfirstinteraction` si `onload` todavía no fue aprobado;
- instalación automática: desactivada para asociación explícita por tienda;
- código: contenido de [`browser/storefront-bootstrap.js`](../browser/storefront-bootstrap.js).

Publicar una versión de prueba, verificarla y activarla. Guardar el Script ID en `TIENDANUBE_STOREFRONT_SCRIPT_ID`.

El bootstrap no contiene Pixel ID ni CAPI key. Tiendanube agrega `store=<STORE_ID>`; el Worker agrega `worker=<PUBLIC_BASE_URL>` al crear la asociación.

## 6. Asociación no automática

Todo Script no autoinstalable necesita una asociación por tienda. Este proyecto la realiza después de OAuth:

```http
POST /2025-03/<STORE_ID>/scripts
Authorization: Bearer <ACCESS_TOKEN>

{
  "script_id": 12345,
  "query_params": "{\"worker\":\"https://openai-conversions.example.com\"}"
}
```

Si la asociación existe, el Worker usa `PUT /scripts/<SCRIPT_ID>` para refrescarla.

## 7. Instalar en la tienda

Abrir en un navegador donde el merchant esté autenticado:

```text
https://openai-conversions.example.com/tiendanube/install
```

Aceptar los permisos. Al regresar al callback, el Worker:

1. valida `state` y cookie;
2. intercambia el `code`;
3. cifra el token OAuth con AES-GCM;
4. guarda la instalación por `store_id`;
5. asegura el webhook `order/paid`;
6. asocia el Script si hay Script ID configurado.

## 8. Webhooks de privacidad

Tiendanube define solicitudes de borrado y acceso. El proyecto incluye rutas para:

- procesar `store/redact` y borrar datos operativos de una tienda desinstalada;
- borrar registros ligados a órdenes indicadas;
- registrar un `customers/data_request` pendiente de informe manual.

La entrega del informe al merchant no está automatizada. Quien opere la app debe completar ese procedimiento conforme a los requisitos vigentes.

## Fuentes oficiales

- [Autenticación](https://tiendanube.github.io/api-documentation/authentication)
- [Scripts](https://tiendanube.github.io/api-documentation/resources/script)
- [Webhooks](https://tiendanube.github.io/api-documentation/resources/webhook)
- [Orders](https://tiendanube.github.io/api-documentation/resources/order)

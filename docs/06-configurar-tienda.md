# 6. Registrar una tienda

## En simple

D1 funciona como un índice: para cada `store_id` indica qué dominio, Pixel y CAPI key le corresponden. Los valores secretos no están en D1; sólo se guarda el **nombre del cajón** de Cloudflare donde está cada Secret.

## 1. Reunir valores

Ejemplo ficticio:

```text
STORE_ID=123456
CLIENT_KEY=demo
STORE_ORIGIN=https://demo.mitiendanube.com
SOURCE_URL=https://www.demo.com
PIXEL_SLOT=OPENAI_PIXEL_ID_DEMO
CAPI_SLOT=OPENAI_CAPI_KEY_DEMO
```

Reglas:

- `store_id`: sólo dígitos;
- `client_key`: slug único, sin datos sensibles;
- `store_origin`: origen Tiendanube de la tienda;
- `source_url`: URL canónica pública;
- slots: nombres exactos de Secrets existentes;
- `validate_only`: siempre `1` al comenzar;
- `enabled`: comenzar en `0` hasta completar OAuth.

## 2. Insertar la configuración

Reemplazá todos los valores ficticios antes de ejecutar:

```bash
npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"INSERT INTO stores (
  store_id, client_key, store_origin, source_url,
  app_secret_slot, tiendanube_token_slot,
  pixel_secret_slot, capi_secret_slot, ads_api_secret_slot,
  validate_only, enabled
) VALUES (
  '123456', 'demo', 'https://demo.mitiendanube.com', 'https://www.demo.com',
  'TIENDANUBE_APP_SECRET', 'd1:app_installations',
  'OPENAI_PIXEL_ID_DEMO', 'OPENAI_CAPI_KEY_DEMO', NULL,
  1, 0
);"
```

No interpolar valores recibidos de usuarios. Este comando es para operación manual controlada.

## 3. Instalar la app

Abrí:

```text
https://openai-conversions.example.com/tiendanube/install
```

Autorizá desde la cuenta de la tienda correcta. Al finalizar, verificá que la instalación exista sin leer el token:

```bash
npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"SELECT store_id, app_id, granted_scopes, status, installed_at
 FROM app_installations WHERE store_id = '123456';"
```

## 4. Habilitar la tienda

Cuando OAuth, webhook y asociación del Script estén correctos:

```bash
npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"UPDATE stores SET enabled = 1, validate_only = 1, updated_at = CURRENT_TIMESTAMP
 WHERE store_id = '123456';"
```

## 5. Verificar asociación del Script

Con el token de operador cargado en una variable de sesión:

```bash
read -s OPERATOR_TEST_TOKEN
export OPERATOR_TEST_TOKEN

curl -sS \
  'https://openai-conversions.example.com/ops/storefront-script-status?store_id=123456' \
  -H "authorization: Bearer $OPERATOR_TEST_TOKEN"
```

Esperado:

```json
{
  "store_id": "123456",
  "script": {
    "status": "active",
    "is_auto_install": false,
    "current_version": 2
  }
}
```

Si necesitás recrear/refrescar la asociación:

```bash
curl -i https://openai-conversions.example.com/ops/associate-storefront-script \
  -H "authorization: Bearer $OPERATOR_TEST_TOKEN" \
  -H 'content-type: application/json' \
  --data '{"store_id":"123456"}'
```

## 6. Confirmar aislamiento

```bash
npx wrangler d1 execute tiendanube-openai-ads --remote --command \
"SELECT store_id, client_key, pixel_secret_slot, capi_secret_slot,
        validate_only, enabled
 FROM stores ORDER BY store_id;"
```

Cada fila debe apuntar a slots únicos del cliente correcto. El código sólo acepta nombres que comiencen con `OPENAI_PIXEL_ID_` y `OPENAI_CAPI_KEY_`; si el Secret no existe, falla cerrado.

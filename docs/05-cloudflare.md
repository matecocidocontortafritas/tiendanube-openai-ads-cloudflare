# 5. Crear la infraestructura en Cloudflare

## En simple

Cloudflare aporta cuatro piezas:

- **Worker:** ejecuta el backend;
- **D1:** recuerda instalaciones y evita duplicados;
- **Queue:** procesa sin demorar el webhook;
- **DLQ:** conserva trabajos que fallaron demasiadas veces.

El dominio personalizado da una URL estable para OAuth y webhooks.

## 1. Preparar el proyecto

```bash
npm ci
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
```

`wrangler.jsonc` está ignorado por Git porque puede contener IDs de infraestructura y dominios del cliente. La plantilla pública es `wrangler.example.jsonc`.

## 2. Elegir nombres

Ejemplo:

```text
Worker: tiendanube-openai-ads
D1: tiendanube-openai-ads
Queue: tiendanube-openai-ads-events
DLQ: tiendanube-openai-ads-dlq
Dominio: openai-conversions.example.com
```

Usá nombres específicos por ambiente si habrá staging y producción.

## 3. Crear D1

```bash
npx wrangler d1 create tiendanube-openai-ads
```

Copiá el `database_id` devuelto dentro del bloque `d1_databases` de `wrangler.jsonc`. Después aplicá las migraciones:

```bash
npx wrangler d1 migrations apply tiendanube-openai-ads --remote
```

Las migraciones crean tablas de tiendas, recibos de webhook, entregas, intentos, OAuth y privacidad. No incluyen ninguna tienda real.

## 4. Crear Queues

```bash
npx wrangler queues create tiendanube-openai-ads-events
npx wrangler queues create tiendanube-openai-ads-dlq
```

La plantilla configura un mensaje por batch, ocho reintentos, 60 segundos de demora y DLQ. Ajustá esos valores según volumen y costos. Los retries cuentan como lecturas adicionales.

## 5. Completar variables públicas

Editar `wrangler.jsonc`:

```jsonc
"vars": {
  "ENVIRONMENT": "staging",
  "SERVICE_NAME": "tiendanube-openai-ads",
  "INTEGRATION_SOURCE": "my_company_tiendanube",
  "PUBLIC_BASE_URL": "https://openai-conversions.example.com",
  "TIENDANUBE_APP_ID": "12345",
  "TIENDANUBE_CONTACT_EMAIL": "developer@example.com",
  "TIENDANUBE_STOREFRONT_SCRIPT_ID": "67890"
}
```

Estas variables no son claves. Aun así, no publiques la configuración operativa del cliente en el repositorio comunitario.

## 6. Crear Secrets base

El app secret se ingresa de forma interactiva:

```bash
npx wrangler secret put TIENDANUBE_APP_SECRET
```

Generar y cargar una clave de cifrado sin imprimirla:

```bash
openssl rand -base64 32 | npx wrangler secret put CREDENTIALS_ENCRYPTION_KEY
```

Generar el token de operador:

```bash
openssl rand -hex 32 | npx wrangler secret put OPERATOR_TEST_TOKEN
```

Si necesitás usar después el token de operador, generá una copia en un password manager y cargá exactamente ese valor de forma interactiva. No lo guardes en Git.

Cloudflare indica que `wrangler secret put` crea una versión y la despliega. Planificá la carga de Secrets y verificá la versión activa después de cada operación.

## 7. Crear Secrets por cliente

Para un slug `DEMO`:

```bash
npx wrangler secret put OPENAI_PIXEL_ID_DEMO
npx wrangler secret put OPENAI_CAPI_KEY_DEMO
```

Para otra tienda, usar otro sufijo:

```text
OPENAI_PIXEL_ID_CLIENTE_B
OPENAI_CAPI_KEY_CLIENTE_B
```

Nunca reutilizar la CAPI key de un ad account en otro cliente.

## 8. Dominio personalizado

Configurar en `wrangler.jsonc`:

```jsonc
"routes": [
  {
    "pattern": "openai-conversions.example.com",
    "custom_domain": true
  }
]
```

La zona DNS debe estar administrada por la misma cuenta Cloudflare. Un Custom Domain conecta el Worker sin gestionar manualmente el certificado.

## 9. Deploy

```bash
npm test
npm run typecheck
npx wrangler deploy
```

Verificar:

```bash
curl -fsS https://openai-conversions.example.com/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "tiendanube-openai-ads",
  "environment": "staging",
  "dependencies": { "d1": true, "queue": true }
}
```

## 10. Desarrollo local

Copiar y editar sólo localmente:

```bash
cp .dev.vars.example .dev.vars
npx wrangler dev
```

`.dev.vars` está ignorado. Cloudflare recomienda usar `.dev.vars` **o** `.env`, no ambos.

## Fuentes oficiales

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Queues retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)

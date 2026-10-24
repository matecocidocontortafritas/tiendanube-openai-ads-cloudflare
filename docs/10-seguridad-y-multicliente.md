# 10. Seguridad y multi-cliente

## Modelo de aislamiento

Cada fila de `stores` enlaza:

```text
store_id
  → client_key
  → pixel_secret_slot
  → capi_secret_slot
```

El valor real de cada Secret vive en Cloudflare. El Worker valida el prefijo del slot y falla si falta. No existe un “secret global por defecto” que pueda enviar eventos de un cliente al Pixel de otro.

## Alta de un segundo cliente

1. crear Pixel/CAPI key en el ad account del cliente B;
2. crear `OPENAI_PIXEL_ID_CLIENTE_B`;
3. crear `OPENAI_CAPI_KEY_CLIENTE_B`;
4. insertar su `store_id` con esos slots;
5. mantener `validate_only=1` y `enabled=0`;
6. completar OAuth desde la tienda B;
7. habilitar sólo después de verificar asociación;
8. probar una orden de B y confirmar el Pixel ID de B;
9. nunca copiar la fila del cliente A sin reemplazar ambos slots y URLs.

## Amenazas y controles

| Riesgo | Control |
|---|---|
| webhook falso | HMAC sobre body crudo + app secret |
| webhook repetido | D1 idempotencia + event ID determinístico |
| token OAuth robado desde D1 | AES-GCM con clave en Cloudflare Secret |
| CAPI key en browser | sólo se resuelve dentro del Worker |
| mezcla de clientes | slots separados y lookup por `store_id` |
| retry infinito | clasificación de errores + máximo + DLQ |
| PII en logs | logs estructurados sólo con IDs/códigos |
| endpoints de prueba abusados | Bearer token constante y comparación temporalmente segura |
| payload enorme | límite de 32 KiB |
| OAuth CSRF | `state`, cookie segura, TTL y uso único |

## Qué no debe guardarse

- CAPI key;
- app secret;
- token OAuth en claro;
- body completo de la orden;
- email, teléfono o dirección en logs;
- capturas con secretos;
- `.dev.vars`, `.env` o configuración del cliente en Git.

## Rate limiting

La idempotencia reduce repeticiones, pero no sustituye protección perimetral. Para exposición pública amplia, agregar Cloudflare WAF/Rate Limiting a:

- `/tiendanube/install`;
- `/tiendanube/oauth/callback`;
- `/webhooks/*` con límites compatibles con el volumen real;
- `/ops/*` con límites estrictos o Cloudflare Access.

No bloquear rangos de Tiendanube sin una fuente oficial actualizada. Un límite demasiado bajo puede perder webhooks legítimos.

## Rotación

Si una clave se expone:

1. revocarla en el sistema emisor;
2. crear una nueva;
3. actualizar Cloudflare Secret;
4. verificar un evento de prueba;
5. revisar logs, capturas, terminal e historial Git;
6. invalidar cachés o artefactos que la contengan;
7. documentar el incidente sin copiar el valor.

Rotar `CREDENTIALS_ENCRYPTION_KEY` requiere recifrar tokens OAuth existentes o reinstalar las tiendas. No reemplazarla directamente: los ciphertext actuales dejarían de poder descifrarse.

## Privacidad y retención

Definí una política explícita para:

- cuánto tiempo conservar recibos e intentos;
- limpieza de OAuth states vencidos;
- tratamiento de DLQ;
- `store/redact` y `customers/redact`;
- respuesta manual a `customers/data_request`;
- base legal y consentimiento para medición.

El repositorio minimiza datos, pero el operador sigue siendo responsable del proceso completo.

## Revisión antes de publicar

```bash
git status --short
git diff --cached
rg -n --hidden \
  '(sk-[A-Za-z0-9_-]+|Bearer [A-Za-z0-9._-]+|client_secret|api[_-]?key)' \
  -g '!node_modules/**' -g '!.git/**'
```

La búsqueda puede encontrar ejemplos o nombres de variables. Revisá manualmente cada coincidencia; no asumas que cero coincidencias garantiza ausencia de secretos.

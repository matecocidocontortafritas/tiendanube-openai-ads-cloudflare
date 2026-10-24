# OpenAI Ads para Tiendanube: Pixel + Conversions API

Plantilla comunitaria para medir eventos de una tienda Tiendanube mediante dos caminos complementarios:

1. **Measurement Pixel:** el navegador informa navegación y acciones del usuario.
2. **Conversions API (CAPI):** un Cloudflare Worker informa desde servidor las órdenes realmente pagadas.

La integración usa los nombres estándar oficiales de OpenAI Ads: `page_viewed`, `contents_viewed`, `items_added`, `checkout_started` y `order_created`. Para una compra, Pixel y CAPI reutilizan el mismo identificador determinístico: `tn_order_<ORDER_ID>`.

> Estado del proyecto: referencia técnica funcional y preparada para adaptar. Antes de usarla en producción hay que completar las cuentas, revisar consentimiento/privacidad, cargar Secrets, instalar la app en una tienda de prueba y validar eventos reales. La disponibilidad de OpenAI Ads y de sus herramientas puede depender de la cuenta.

## Explicado en una frase

El Pixel cuenta lo que sucede en la vidriera; el webhook confirma desde la caja que la compra se pagó. OpenAI recibe ambos relatos y reconoce la misma compra por su `event_id`, evitando contarla dos veces.

## Arquitectura

```text
Cliente en Tiendanube
  └─ Script Partner
      └─ Worker: /pixel/storefront.js?store_id=...
          └─ OpenAI Measurement Pixel
              ├─ page_viewed
              ├─ contents_viewed
              ├─ items_added
              ├─ checkout_started
              └─ order_created ──────────────┐
                                             │ mismo Pixel ID,
Tiendanube order/paid                        │ evento e ID
  └─ valida HMAC                             │ tn_order_123
      └─ D1 deduplica                        │
          └─ Cloudflare Queue                │
              └─ consulta orden completa     │
                  └─ confirma paid           │
                      └─ OpenAI CAPI ─────────┘
```

## Qué incluye

- Worker TypeScript con OAuth de Tiendanube, validación HMAC y webhooks de privacidad.
- D1 para instalaciones, idempotencia y auditoría sin almacenar cuerpos de órdenes.
- Queue con reintentos y dead-letter queue.
- Pixel browser-side por tienda, consentimiento y eventos estándar.
- CAPI `order_created`, `validate_only`, matching hasheado y atribución disponible.
- Separación multi-cliente por `store_id` y nombres de Secrets independientes.
- Endpoints de operación autenticados para pruebas y replay.
- Pruebas unitarias y typecheck.
- Manual paso a paso para perfiles técnicos y no técnicos.

## Camino recomendado

| Etapa | Resultado esperado | Guía |
|---|---|---|
| 1 | Entender componentes y costos | [Arquitectura](docs/01-arquitectura.md) |
| 2 | Crear y preparar cuentas | [Cuentas y accesos](docs/02-cuentas-y-accesos.md) |
| 3 | Crear Pixel y CAPI key | [OpenAI Ads](docs/03-openai-ads.md) |
| 4 | Crear la app Partner | [Tiendanube Partners](docs/04-tiendanube-partners.md) |
| 5 | Crear Worker, D1, Queues y dominio | [Cloudflare](docs/05-cloudflare.md) |
| 6 | Registrar una tienda y sus Secrets | [Configurar tienda](docs/06-configurar-tienda.md) |
| 7 | Instalar y validar Pixel | [Measurement Pixel](docs/07-measurement-pixel.md) |
| 8 | Validar webhook y CAPI | [Conversions API](docs/08-conversions-api.md) |
| 9 | Pasar de prueba a producción | [Testing y lanzamiento](docs/09-testing-y-lanzamiento.md) |
| 10 | Operar con seguridad | [Seguridad y multi-cliente](docs/10-seguridad-y-multicliente.md) |
| 11 | Hacerlo bajo control de Codex | [Trabajo asistido con Codex](docs/11-codex.md) |
| 12 | Resolver fallas frecuentes | [Troubleshooting](docs/12-troubleshooting.md) |
| 13 | Ver un procedimiento real anonimizado | [Caso real](docs/13-caso-real-anonimizado.md) |

## Inicio rápido para desarrolladores

```bash
git clone <URL-DE-TU-FORK>
cd tiendanube-openai-ads
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npm test
npm run typecheck
```

No ejecutes `wrangler deploy` todavía. Primero completa [Cloudflare](docs/05-cloudflare.md) y reemplaza todos los placeholders del `wrangler.jsonc` local.

## Principios de seguridad

- Ninguna API key debe llegar al navegador.
- Los valores reales de `.dev.vars`, `.env`, `wrangler.jsonc` local y `.local/` quedan fuera de Git.
- Los tokens OAuth de Tiendanube se cifran con AES-GCM antes de guardarse en D1.
- Los webhooks se verifican con el body crudo y `x-linkedstore-hmac-sha256`.
- Los datos de matching se normalizan y hashean antes de enviarse.
- Los logs no contienen body de orden, claves, email ni teléfono.
- `validate_only = 1` es el estado inicial obligatorio de cada tienda.

## Documentación oficial utilizada

- [OpenAI Ads: Conversion tracking](https://developers.openai.com/ads/conversion-tracking)
- [OpenAI Ads: Measurement Pixel](https://developers.openai.com/ads/measurement-pixel)
- [OpenAI Ads: Conversions API](https://developers.openai.com/ads/conversions-api)
- [OpenAI Ads: Supported Events](https://developers.openai.com/ads/supported-events)
- [Tiendanube: autenticación](https://tiendanube.github.io/api-documentation/authentication)
- [Tiendanube: Scripts](https://tiendanube.github.io/api-documentation/resources/script)
- [Tiendanube: Webhooks](https://tiendanube.github.io/api-documentation/resources/webhook)
- [Tiendanube: Orders](https://tiendanube.github.io/api-documentation/resources/order)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)

Documentación revisada el **24 de octubre de 2026**. Antes de una nueva instalación, comprobar si cambiaron endpoints, permisos, nombres de eventos o requisitos de aprobación.

## Alcance y límites

Este repositorio no reemplaza asesoramiento legal sobre consentimiento, privacidad o retención de datos. Tampoco garantiza que OpenAI Ads, Event Stream, la Advertiser API o determinadas opciones de Scripts estén habilitadas en todas las cuentas. El checkout y los temas de Tiendanube pueden variar: la instrumentación browser-side siempre debe validarse en una tienda real de prueba.

## Licencia

[MIT](LICENSE). Podés usar, adaptar y compartir el proyecto conservando el aviso de licencia.

# 11. Implementarlo bajo control de Codex

## Qué significa “bajo control”

Codex puede trabajar sobre el repositorio, ejecutar tests y comandos, consultar documentación y, cuando la instalación lo permite, operar una ventana de Chrome donde vos ya iniciaste sesión. El usuario conserva control sobre permisos, credenciales, acciones externas y publicación.

No todas las instalaciones de Codex tienen las mismas integraciones de navegador. Si no hay control de Chrome, Codex puede preparar código/comandos y vos ejecutás los pasos visuales.

## Preparación

1. clonar este repositorio en una carpeta exclusiva;
2. abrir esa carpeta como proyecto local en Codex;
3. iniciar sesión personalmente en Tiendanube Partners, Cloudflare y OpenAI Ads;
4. habilitar Chrome/Browser sólo para los dominios necesarios;
5. no abrir password managers, bancos ni otras pestañas sensibles en el mismo perfil;
6. mantener una tienda demo separada de producción.

## Prompt maestro sugerido

```text
Quiero instalar OpenAI Ads Measurement Pixel + Conversions API en una tienda
Tiendanube usando este repositorio y Cloudflare Workers.

Trabajá paso a paso y usá únicamente documentación oficial actual.
No inventes eventos, schemas ni endpoints. Mantené validate_only activo hasta que
yo confirme el primer envío real. No muestres, imprimas ni guardes secretos.
Antes de cualquier deploy, cambio productivo, revocación, mensaje a soporte o push
a GitHub, mostrame el objetivo y pedime confirmación si todavía no la di.

Primero auditá el repositorio, corré tests y typecheck, y devolveme un checklist de
cuentas, IDs no secretos y decisiones faltantes. Después guiame por OpenAI Ads,
Tiendanube Partners y Cloudflare. Verificá cada cambio leyendo el estado resultante.
```

## División de tareas

### Codex puede hacer

- leer documentación oficial y comparar schemas;
- editar TypeScript, SQL y documentación;
- crear comandos de Wrangler;
- ejecutar tests y typecheck;
- crear D1/Queues/Worker con autorización;
- completar campos no secretos en interfaces;
- comprobar `/health`, D1 y estado de Script;
- abrir Chrome y verificar Network/DOM;
- preparar un ticket de soporte;
- crear commits y publicar a GitHub cuando lo autorices.

### La persona debe controlar

- login, 2FA y recuperación de cuentas;
- aceptación de términos;
- alcance legal del consentimiento;
- selección del ad account/tienda correctos;
- lectura y carga de secretos de una sola visualización;
- decisión de revocar credenciales;
- primer evento real;
- envío de comunicaciones a terceros;
- elección de licencia y publicación pública.

## Procedimiento seguro para Secrets

Pedile a Codex que deje listo el comando:

```bash
npx wrangler secret put OPENAI_CAPI_KEY_CLIENTE
```

Ejecutalo en una terminal interactiva y pegá el valor directamente cuando Wrangler lo solicite. No escribas el valor en el prompt. Después pedile a Codex que verifique solamente que **el nombre del Secret** aparece configurado; el valor no debe recuperarse.

Si una herramienta de navegador, captura o salida de terminal muestra el valor, consideralo expuesto: revocá y rotá.

## Validación visual con Chrome

Prompt sugerido:

```text
Abrí una sesión limpia de Chrome para la tienda de prueba. No compres ni envíes
formularios reales sin mi confirmación. Verificá si Tiendanube entrega el Script,
si carga /pixel/storefront.js y si existe window.OpenAIAdsTiendanube. Después
probá page_viewed, contents_viewed, items_added y checkout_started. Separá lo
observado de lo inferido y no declares activo order_created browser-side si el
script no corre en la página de éxito.
```

## Trabajo reproducible

Pedile a Codex que, en cada etapa:

1. enumere la evidencia esperada;
2. ejecute o describa el cambio;
3. lea el estado final;
4. documente IDs no secretos y limitaciones;
5. corra tests después de editar código;
6. no confunda “configurado” con “verificado en producción”.

## GitHub con Codex

Antes del primer push:

```text
Auditá el árbol completo para secretos y datos de clientes. Confirmá que los
archivos ignorados no estén staged. Mostrame el diff, tests y lista exacta de
archivos. No crees ni publiques el repositorio hasta mi confirmación.
```

Este proyecto incluye [`AGENTS.md`](../AGENTS.md) con invariantes para Codex y revisiones futuras. Las reglas ayudan, pero no reemplazan CI, branch protection ni revisión humana.

## Fuentes oficiales

- [Usar computadora y Chrome](https://developers.openai.com/training/walkthroughs/using-your-computer-and-browser)
- [Computer use y controles de seguridad](https://developers.openai.com/api/docs/guides/tools-computer-use)
- [Reglas de revisión con AGENTS.md](https://developers.openai.com/blog/custom-code-review-rules-for-codex)

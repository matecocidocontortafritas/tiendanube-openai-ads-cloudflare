# 2. Cuentas y accesos

## Checklist en simple

Necesitás cuatro “llaves de entrada”:

1. una tienda Tiendanube donde probar;
2. una cuenta Tiendanube Partners para crear la app;
3. una cuenta Cloudflare que controle un dominio;
4. una cuenta habilitada para OpenAI Ads y conversiones.

Además necesitás GitHub para publicar el código y una computadora con Node.js, Git y Wrangler.

## A. Tiendanube

### Cuenta de tienda

Crear o elegir una tienda de desarrollo/prueba. Debés poder:

- instalar una app Partner;
- hacer una compra de prueba;
- inspeccionar una orden pagada;
- probar storefront, carrito y checkout.

Anotar el `store_id`. No confundirlo con el dominio ni con el ID de la app.

### Cuenta Partners

Ingresar al portal de Partners y crear una aplicación. La misma persona puede administrar varias apps, pero cada instalación OAuth pertenece al par exacto **app + tienda**.

Permisos mínimos para este proyecto:

- `read_orders`, para consultar la orden completa;
- `write_scripts`, para asociar el Script Partner.

No pedir permisos que no se usan. Si se cambian scopes, reinstalar la app para que la tienda otorgue un token nuevo.

Información necesaria:

- App ID o client ID;
- App secret;
- email de contacto técnico;
- Redirect URL HTTPS del Worker;
- URL de la página de la app;
- URLs de privacidad/webhooks requeridas por Tiendanube;
- Script ID después de crear el Script Partner.

## B. Cloudflare

Crear una cuenta y agregar el dominio que controlará el subdominio del Worker. Ejemplo:

```text
Dominio de la tienda: example.com
Worker: openai-conversions.example.com
```

La cuenta debe permitir crear Workers, D1, Queues, Secrets y Custom Domains. Usá una cuenta del cliente o una cuenta de agencia con permisos explícitos. Documentá quién es propietario y quién puede rotar credenciales.

## C. OpenAI Ads

La cuenta debe tener acceso a Ads Manager y al área de conversiones. La disponibilidad puede estar limitada por cuenta o programa. No confundir:

- **Pixel ID:** identifica la fuente; aparece en browser y no es una contraseña.
- **Conversions API key:** autoriza envíos a `bzr.openai.com`; nunca va al browser.
- **Advertiser API key:** sirve para administración y endpoints como eventos recientes cuando la cuenta los tiene habilitados; no reemplaza a la CAPI key.

Si la cuenta no muestra conversiones, pixels o API keys, contactar al representante/soporte de OpenAI Ads. No inventar endpoints alternativos.

## D. GitHub

Crear una cuenta u organización y decidir:

- repositorio público o privado;
- propietario del repositorio;
- nombre sugerido: `tiendanube-openai-ads-cloudflare`;
- licencia open source;
- política de issues y contribuciones.

Antes de publicar, ejecutar una búsqueda de secretos y revisar que no estén versionados `wrangler.jsonc`, `.dev.vars`, `.env`, dumps, logs ni capturas.

## E. Herramientas locales

Instalar Git, Node.js 22 o superior, npm, Wrangler —incluido como dependencia—, Chrome para una sesión limpia y, opcionalmente, Codex Desktop o Codex CLI.

```bash
git --version
node --version
npm --version
npx wrangler --version
```

## Matriz de acceso recomendada

| Sistema | Acceso humano | Uso de Codex |
|---|---|---|
| Tiendanube tienda | Administrador de prueba | Navegar, instalar y verificar con confirmación |
| Tiendanube Partners | Owner/developer | Configurar app y Script bajo supervisión |
| Cloudflare | Developer con Workers/D1/Queues | Crear y desplegar infraestructura |
| OpenAI Ads | Administrador del ad account | Crear Pixel/CAPI key con manejo seguro |
| GitHub | Maintainer | Crear repo, commit y push sólo tras confirmación |

Nunca pegues una clave en el chat. Cuando una UI revele un secreto una única vez, ingresalo directamente en el prompt protegido de Wrangler o en Cloudflare Secrets. Si un secreto aparece en una captura, log o herramienta de accesibilidad, revocalo y generá otro.

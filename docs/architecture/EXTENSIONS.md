# GafCore — Ecosistema de extensiones (E0–E1)

> **Estado:** E0–E2 en producción; POST marketplace vía `server.ts` (no TanStack SSR). Admin en `/gafcore/admin/marketplace`. Migraciones: `npm run gafcore:migrate-extensions`.  
> El **core** (chat, workflow, deploy, auth) no importa código de terceros; solo valida manifests y delega al **Extension Host**.

## Principios

1. **Manifest versionado** (`gafcore.extension.manifest.v1`) validado con Zod en servidor.
2. **Sin ejecución arbitraria** en el proceso del core: sin `eval`, sin npm de terceros en el bundle del IDE.
3. **Paths permitidos** solo bajo `src/`, `public/`; denegar `..`, `supabase/migrations`, `.env`.
4. **Feature flag:** `GAFCORE_EXTENSIONS_ENABLED` (default on si no está definido).

## Tipos de recurso (roadmap)

| Tipo | E1 | E3+ |
|------|----|-----|
| `template` | ✅ | |
| `ai_plugin` | ✅ `before_chat` + `systemPromptAppend` | webhooks |
| `agent` | ✅ webhook `workflow_complete` / `workflow_failed` | edge_function runner |
| `workflow_pack` | | DAG precargado |

## Tablas (migración `20260531120000`)

- `gafcore_publishers` — creador del listing
- `gafcore_marketplace_listings` — catálogo (`draft` \| `review` \| `published` \| `revoked`)
- `gafcore_extension_versions` — semver + `manifest_json`
- `gafcore_extension_installs` — instalación por usuario (y opcionalmente proyecto)

## Resolver de plantillas

Orden al cargar archivos por `slug`:

1. Slug `ext:{listing_slug}` → manifest de instalación del usuario
2. `gafcore_project_templates` (oficial / seed)
3. Built-in en código (`gafcore-templates.shared`)

El IDE y `createProjectFromTemplate` **no cambian** su API; solo el servidor resuelve más orígenes.

## API HTTP (v1)

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/api/extensions/v1/catalog` | Bearer (installed/purchased flags) |
| POST | `/api/extensions/v1/install` | Bearer sesión |
| POST | `/api/extensions/v1/uninstall` | Bearer sesión |
| POST | `/api/extensions/v1/checkout-session` | Bearer sesión |
| POST | `/api/gafcore/checkout-confirm` | Bearer (planes + extensiones) |
| GET | `/api/extensions/v1/catalog` | Opcional (público, sin flags usuario) |
| GET | `/api/extensions/v1/manifest` | `?listingId=` |

## UI

- `/gafcore/marketplace` — listado + instalar plantillas publicadas
- `/gafcore/publisher` — enviar extensiones a revisión
- Ajustes proyecto → sección **Marketplace** → extensiones instaladas + enlace al catálogo

## Server functions

- `listGafcoreExtensionsCatalog` — catálogo con flag `installed`
- `getGafcoreExtensionManifest` — manifest de versión publicada
- `installGafcoreExtension` / `uninstallGafcoreExtension` — installs por usuario
- Chat IDE: `buildAiPluginPromptAppend` en `ai-plugins.server.ts`

## Migración

```bash
npm run gafcore:migrate-extensions
# o SQL Editor: supabase/migrations/20260531120000_gafcore_extensions.sql
```

## Variables

```bash
GAFCORE_EXTENSIONS_ENABLED=1
GAFCORE_MAX_EXTENSIONS_PER_USER=20
```

## Publisher

| Ruta | Quién |
|------|--------|
| `/gafcore/publisher` | Cualquier usuario logueado — envía listings a estado `review` |
| `/gafcore/admin/marketplace` | Solo `admin` — publica/revoca directamente |

Migración E2: `price_cents` / `currency` en listings; tabla `gafcore_extension_purchases`.

**Pagos:** `POST /api/extensions/v1/checkout-session` (embedded Stripe) → `checkout-confirm` o webhook → compra + auto-instalación.

Demo publicado: `premium-landing-demo` (1,99 €). En revisión: `community-tone-review`.

## Fases siguientes

- **E2+:** Precios fijos Stripe Price ID por listing (opcional)
- **E5:** API keys publisher + moderación automática

Ver también `WORKFLOW_DEPLOY_CHECKLIST.md` (workflow independiente).

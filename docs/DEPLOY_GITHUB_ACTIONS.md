# Deploy automático con GitHub Actions → Vercel

El workflow [`.github/workflows/deploy-vercel-production.yml`](../.github/workflows/deploy-vercel-production.yml) despliega a **Production** en cada push a `main` (y con **Run workflow** manual).

> Si el proyecto ya está conectado a GitHub en Vercel, también se despliega solo. Puedes usar **solo Vercel Git** o **solo Actions**; si activas ambos, habrá dos builds por push.

## Secrets requeridos (repo → Settings → Secrets and variables → Actions)

| Secret | Dónde obtenerlo |
|--------|------------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) — scope del proyecto |
| `VERCEL_ORG_ID` | Vercel → Team/Account → Settings → **Team ID** (o `vercel whoami` + API) |
| `VERCEL_PROJECT_ID` | Proyecto **gafcore** → Settings → General → **Project ID** |

Comando local (con CLI logueada):

```bash
npx vercel link --project gafcore
cat .vercel/project.json
```

Ahí verás `orgId` y `projectId`.

## Comprobar que funciona

1. GitHub → **Actions** → **Deploy Vercel Production**
2. Tras un push a `main`, el job debe terminar en verde.
3. Producción: `https://gafcore.com/api/__runtime-diag` → campo `commit` = último SHA de `main`.

## Si el workflow falla

- **Missing secret**: añade los tres secrets.
- **Build error**: revisa logs del step `Build (Vercel preset)`; reproduce con `VERCEL=1 npm run build` en local.
- **Deploy blocked (Hobby)**: el autor del commit debe ser el dueño de la cuenta Vercel enlazada al proyecto.

## Alternativa sin Actions

```bash
npm run build
npx vercel deploy --prebuilt --prod --yes
```

O push a `main` con Vercel Git conectado al repo `aperezavilez-ai/Gafcore`.

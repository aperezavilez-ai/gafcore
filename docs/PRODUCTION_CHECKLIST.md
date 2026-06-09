# GafCore — Checklist de producción

## 1. Supabase — migraciones (SQL Editor, en orden)

Aplicar todas las que no estén aplicadas:

```
20260520120000_user_github_credentials.sql
20260521120000_project_ai_memory.sql
20260522120000_gafcore_project_templates.sql
20260523120000_project_deploy_status.sql
20260524120000_migrations_repair_idempotent.sql
20260525000000_gafcore_project_brands.sql
20260525120000_gafcore_pipeline_runs.sql
20260526120000_gafcore_validation_runs.sql
20260527120000_project_memory_graph.sql
20260528120000_gafcore_agent_tasks.sql
20260528200000_gafcore_chat_response_cache.sql
20260529120000_gafcore_task_claim_rpc.sql
20260529140000_gafcore_governance.sql
20260529150000_gafcore_governance_approvals.sql
20260531120000_gafcore_extensions.sql
20260531130000_gafcore_extensions_catalog_seed.sql
20260531140000_gafcore_extensions_agents.sql
20260531150000_gafcore_extensions_e2.sql
20260531160000_gafcore_extension_purchases.sql
20260531180000_gafcore_project_code_snapshots.sql
20260531190000_gafcore_health_logs.sql
20260609120000_gafcore_project_versions.sql   ← NUEVA (historial versiones BD)
```

Verificación tras aplicar:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'projects' AND column_name LIKE 'deploy%';

SELECT slug, name FROM public.gafcore_project_templates ORDER BY sort_order;

SELECT COUNT(*) FROM public.gafcore_project_versions;
```

### Supabase Auth
- Redirect URLs en panel → incluir `https://gafcore.com/api/public/oauth.*`
- Email templates configurados (recovery, magic link)

---

## 2. Vercel — variables de entorno

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `VITE_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Clave anon/publishable |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | ID del proyecto |
| `VITE_PUBLIC_SITE_URL` | ✅ | `https://gafcore.com` |
| `SUPABASE_URL` | ✅ | Igual que VITE_ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clave service_role (server only) |
| `OPENROUTER_API_KEY` | ✅ (o alternativa) | IA chat IDE |
| `STRIPE_SECRET_KEY` | ✅ | Pagos |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Webhooks Stripe |
| `VERCEL_TOKEN` | Recomendado | Auto-deploy proyectos usuarios |
| `GAFCORE_DEPLOY_VALIDATION_GATE` | Opcional | `hard`/`soft`/`off` (default: hard) |
| `GAFCORE_WORKFLOW_MAX_PARALLEL` | Opcional | Concurrencia workflows (default: 3) |
| `GAFCORE_CRON_SECRET` | Recomendado | Protege `/api/gafcore/workflow/drain` |

---

## 3. Stripe
- Webhook apuntando a `https://gafcore.com/api/public/payments/webhook`
- Precios con `lookup_key` o metadata `gafcore_price_id`
- Activar modo live (no sandbox)

---

## 4. Cron (Vercel) — ya configurado en `vercel.json`
- `*/5 * * * *` → `/api/gafcore/workflow/drain` (cada 5 min)
- Verificar que `GAFCORE_CRON_SECRET` esté configurado

---

## 5. Verificación post-deploy

1. Abrir `https://gafcore.com` → landing carga sin errores
2. Registro → login → IDE carga
3. Onboarding wizard aparece en primer acceso
4. `+ Nuevo` → crear proyecto → chat genera código → preview muestra resultado
5. Publicar → GitHub push → Vercel deploy → URL en vivo
6. Historial de versiones → guardar manual → restaurar
7. Editor visual → activar → click en elemento → panel aparece
8. Mobile preview → toggle 📱 → preview en 375px

---

## 6. SEO / indexación
- `robots.txt` y `sitemap.xml` ya están en `/public`
- Enviar sitemap a Google Search Console: `https://gafcore.com/sitemap.xml`
- OG image en `/public/og-image.png`

---

## 7. Seguridad (ya configurado en `vercel.json`)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

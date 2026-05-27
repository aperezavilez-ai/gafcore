# GafCore en móvil — PWA y tiendas

GafCore (la plataforma) se distribuye por **tres vías**:

| Vía | Usuario | Estado en repo |
|-----|---------|----------------|
| **Web** | Navegador → gafcore.com | Producción |
| **PWA** | Instalar desde Chrome/Safari | `public/manifest.webmanifest` + `sw.js` |
| **Tiendas** | Google Play / App Store | `apps/gafcore-mobile` (Capacitor) |

## PWA (instalar sin tienda)

1. Usuario visita gafcore.com en móvil o desktop compatible.
2. Bloque **«Descarga GafCore en cualquier dispositivo»** en la landing.
3. Botón **Instalar app (PWA)** cuando el navegador dispara `beforeinstallprompt`.
4. iOS: Compartir → «Añadir a pantalla de inicio».

Archivos:

- `public/manifest.webmanifest`
- `public/sw.js`
- `src/components/GafcoreInstallApp.tsx`
- Meta PWA en `src/routes/__root.tsx`

## App nativa (Capacitor)

Proyecto: `apps/gafcore-mobile/`

```bash
cd apps/gafcore-mobile
npm install
npm run cap:init
npm run cap:sync
npm run cap:android   # o cap:ios
```

La app abre `https://gafcore.com` en WebView (configurable con `GAFCORE_MOBILE_URL`).

## Variables Vercel (web)

| Variable | Uso |
|----------|-----|
| `VITE_GAFCORE_PLAY_STORE_URL` | Enlace botón Google Play en landing |
| `VITE_GAFCORE_APP_STORE_URL` | Enlace botón App Store en landing |
| `VITE_GAFCORE_MOBILE_SERVER_URL` | URL mostrada en textos (default gafcore.com) |

## Checklist publicación tiendas

- [ ] Cuenta Google Play + Apple Developer activas
- [ ] Icono 512×512, capturas, descripción corta/larga
- [ ] Política de privacidad y soporte (email/web)
- [ ] Probar login Supabase, pagos Stripe y IDE en WebView
- [ ] Subir builds y enviar a revisión
- [ ] Añadir URLs de tienda en Vercel

## Notas

- Los **proyectos que los usuarios generan** en GafCore siguen publicándose con **Publicar** (web/Vercel), no con este flujo.
- Este documento es solo para la **app GafCore** como producto.

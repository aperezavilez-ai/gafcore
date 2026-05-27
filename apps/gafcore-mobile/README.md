# GafCore Mobile (Capacitor)

App contenedor **Android** e **iOS** que carga la plataforma web en `https://gafcore.com`.

## Requisitos

- Node 20+
- Android Studio (Android)
- Xcode + macOS (iOS)
- Cuentas Google Play Developer y Apple Developer para publicar

## Setup (una vez)

```bash
cd apps/gafcore-mobile
npm install
npm run cap:init
npm run cap:sync
```

## Desarrollo

Abrir proyecto nativo:

```bash
npm run cap:android
npm run cap:ios
```

Staging / preview:

```bash
set GAFCORE_MOBILE_URL=https://tu-preview.vercel.app
npm run cap:sync
```

## Publicar en tiendas

1. Iconos y splash en `android/` y `ios/` (Android Studio / Xcode).
2. Versión y `applicationId` / bundle id: `com.gafcore.app`.
3. Política de privacidad pública: `https://gafcore.com/privacy`.
4. Subir **AAB** a Google Play Console.
5. Subir **IPA** vía Xcode → App Store Connect.

Cuando las fichas estén vivas, define en Vercel (web):

- `VITE_GAFCORE_PLAY_STORE_URL`
- `VITE_GAFCORE_APP_STORE_URL`

La landing mostrará botones Google Play / App Store automáticamente.

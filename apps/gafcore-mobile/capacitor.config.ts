import type { CapacitorConfig } from "@capacitor/cli";

/**
 * URL de GafCore en producción (o staging).
 * Override local: GAFCORE_MOBILE_URL=https://tu-preview.vercel.app
 */
const serverUrl = process.env.GAFCORE_MOBILE_URL?.trim() || "https://gafcore.com";

const config: CapacitorConfig = {
  appId: "com.gafcore.app",
  appName: "GafCore",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#0b0d12",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b0d12",
    },
  },
};

export default config;

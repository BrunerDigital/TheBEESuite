import type { CapacitorConfig } from "@capacitor/cli";

const productionHost = "thebeesuite.io";

const config: CapacitorConfig = {
  appId: "com.brunerdigital.thebeesuite.parent",
  appName: "BEE Suite Parent Portal",
  webDir: "native/parent-shell",
  server: {
    url: `https://${productionHost}`,
    appStartPath: "/parents",
    allowNavigation: [productionHost, `*.${productionHost}`],
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;

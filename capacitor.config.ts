import type { CapacitorConfig } from "@capacitor/cli";

const productionHost = "thebeesuite.io";
const nativeApp = process.env.BEE_SUITE_NATIVE_APP === "teacher" ? "teacher" : "parent";

const apps = {
  parent: {
    appId: "com.brunerdigital.thebeesuite.parent",
    appName: "BEE Suite Parent Portal",
    webDir: "native/parent-shell",
    launchPath: "/parents",
    iosPath: "ios",
    backgroundColor: "#05070a",
  },
  teacher: {
    appId: "com.brunerdigital.thebeesuite.teacher",
    appName: "BEE Suite Teacher Portal",
    webDir: "native/teacher-shell",
    launchPath: "/teachers",
    iosPath: "ios-teacher",
    backgroundColor: "#151515",
  },
} as const satisfies Record<string, {
  appId: string;
  appName: string;
  webDir: string;
  launchPath: string;
  iosPath: string;
  backgroundColor: string;
}>;

const app = apps[nativeApp];

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: app.webDir,
  ios: {
    path: app.iosPath,
    backgroundColor: app.backgroundColor,
    contentInset: "automatic",
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: false,
  },
  server: {
    // Capacitor also checks appStartPath against bundled files before loading a
    // remote URL. These Next.js routes are remote, not files in the native shell.
    url: `https://${productionHost}${app.launchPath}`,
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;

import type { CapacitorConfig } from "@capacitor/cli";

const productionHost = "thebeesuite.io";
const nativeApp = process.env.BEE_SUITE_NATIVE_APP === "teacher" ? "teacher" : "parent";

const apps = {
  parent: {
    appId: "com.brunerdigital.thebeesuite.parent",
    appName: "BEE Suite Parent Portal",
    webDir: "native/parent-shell",
    appStartPath: "/parents",
    iosPath: "ios",
    backgroundColor: "#05070a",
  },
  teacher: {
    appId: "com.brunerdigital.thebeesuite.teacher",
    appName: "BEE Suite Teacher Portal",
    webDir: "native/teacher-shell",
    appStartPath: "/teachers",
    iosPath: "ios-teacher",
    backgroundColor: "#151515",
  },
} as const satisfies Record<string, {
  appId: string;
  appName: string;
  webDir: string;
  appStartPath: string;
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
    url: `https://${productionHost}`,
    appStartPath: app.appStartPath,
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;

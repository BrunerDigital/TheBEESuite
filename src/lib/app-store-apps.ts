import type { MetadataRoute } from "next";
import type { LoginPortal } from "@/lib/login-routing";

const appIcon = "/brand/the-bee-suite/app-icon-yellow.png";
const favicon = "/brand/the-bee-suite/favicon.png";

export type StoreAppKey = "parent" | "teacher" | "director" | "executive";

export type StoreAppDefinition = {
  key: StoreAppKey;
  portal: LoginPortal;
  appStoreName: string;
  displayName: string;
  shortName: string;
  bundleId: string;
  sku: string;
  loginPath: string;
  setupPath?: string;
  workspacePath: string;
  manifestPath: string;
  description: string;
  appStoreSubtitle: string;
  themeColor: string;
  backgroundColor: string;
  categories: MetadataRoute.Manifest["categories"];
  shortcuts: Array<{
    name: string;
    short_name: string;
    description: string;
    url: string;
  }>;
};

export const storeApps = {
  parent: {
    key: "parent",
    portal: "parents",
    appStoreName: "BEE Suite Parent Portal",
    displayName: "BEE Suite",
    shortName: "BEE Parents",
    bundleId: "com.brunerdigital.thebeesuite.parent",
    sku: "BEE-SUITE-PARENT-IOS",
    loginPath: "/parents",
    setupPath: "/parents/setup",
    workspacePath: "/parent-portal",
    manifestPath: "/parents/manifest.webmanifest",
    description: "Secure parent and guardian access to child updates, messages, documents, tuition, photos, and family requests.",
    appStoreSubtitle: "Childcare updates in one app",
    themeColor: "#f5b51b",
    backgroundColor: "#05070a",
    categories: ["education", "productivity"],
    shortcuts: [
      {
        name: "Parent Portal",
        short_name: "Portal",
        description: "Open family dashboard, child updates, photos, messages, documents, and tuition.",
        url: "/parent-portal",
      },
    ],
  },
  teacher: {
    key: "teacher",
    portal: "teachers",
    appStoreName: "BEE Suite Teacher",
    displayName: "BEE Suite",
    shortName: "BEE Teachers",
    bundleId: "com.brunerdigital.thebeesuite.teacher",
    sku: "BEE-SUITE-TEACHER-IOS",
    loginPath: "/teachers",
    workspacePath: "/teacher-portal",
    manifestPath: "/teachers/manifest.webmanifest",
    description: "Classroom attendance, daily reports, media, incidents, messages, and teacher workflows.",
    appStoreSubtitle: "Classroom tools for teachers",
    themeColor: "#f5b51b",
    backgroundColor: "#05070a",
    categories: ["education", "productivity"],
    shortcuts: [],
  },
  director: {
    key: "director",
    portal: "directors",
    appStoreName: "BEE Suite Director",
    displayName: "BEE Suite",
    shortName: "BEE Directors",
    bundleId: "com.brunerdigital.thebeesuite.director",
    sku: "BEE-SUITE-DIRECTOR-IOS",
    loginPath: "/directors",
    workspacePath: "/dashboard",
    manifestPath: "/directors/manifest.webmanifest",
    description: "School operations for enrollment, staffing, classrooms, billing, compliance, reporting, and family support.",
    appStoreSubtitle: "School operations workspace",
    themeColor: "#f5b51b",
    backgroundColor: "#05070a",
    categories: ["business", "education", "productivity"],
    shortcuts: [],
  },
  executive: {
    key: "executive",
    portal: "executives",
    appStoreName: "BEE Suite Executive",
    displayName: "BEE Suite",
    shortName: "BEE Executive",
    bundleId: "com.brunerdigital.thebeesuite.executive",
    sku: "BEE-SUITE-EXECUTIVE-IOS",
    loginPath: "/executives",
    workspacePath: "/dashboard",
    manifestPath: "/executives/manifest.webmanifest",
    description: "Corporate office visibility, multi-location reporting, FTE review, account setup, and executive controls.",
    appStoreSubtitle: "Multi-location childcare ops",
    themeColor: "#f5b51b",
    backgroundColor: "#05070a",
    categories: ["business", "education", "productivity"],
    shortcuts: [],
  },
} satisfies Record<StoreAppKey, StoreAppDefinition>;

export function buildStoreAppManifest(app: StoreAppDefinition): MetadataRoute.Manifest {
  return {
    id: app.loginPath,
    name: app.appStoreName,
    short_name: app.shortName,
    description: app.description,
    start_url: app.loginPath,
    scope: "/",
    lang: "en-US",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: app.backgroundColor,
    theme_color: app.themeColor,
    categories: app.categories,
    launch_handler: {
      client_mode: "focus-existing",
    },
    icons: [
      {
        src: appIcon,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appIcon,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: favicon,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: app.shortcuts.map((shortcut) => ({
      ...shortcut,
      icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
    })),
  };
}

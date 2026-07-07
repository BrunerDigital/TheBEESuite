import type { Metadata } from "next";
import { PortalLoginPage } from "@/components/portal-login-page";
import { storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-dynamic";

const parentApp = storeApps.parent;

export const metadata: Metadata = {
  title: `${parentApp.appStoreName} | The BEE Suite`,
  applicationName: parentApp.appStoreName,
  description: parentApp.description,
  manifest: parentApp.manifestPath,
  icons: {
    apple: [{ url: "/brand/the-bee-suite/app-icon-yellow.png", sizes: "1024x1024", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: parentApp.shortName,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function ParentsLoginPage({ searchParams }: PageProps) {
  return <PortalLoginPage portal="parents" searchParams={searchParams} />;
}

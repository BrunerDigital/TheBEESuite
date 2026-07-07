import type { Metadata } from "next";
import { PortalLoginPage } from "@/components/portal-login-page";
import { storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-dynamic";

const executiveApp = storeApps.executive;

export const metadata: Metadata = {
  title: `${executiveApp.appStoreName} Login | The BEE Suite`,
  applicationName: executiveApp.appStoreName,
  description: executiveApp.description,
  manifest: executiveApp.manifestPath,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: executiveApp.shortName,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function ExecutivesLoginPage({ searchParams }: PageProps) {
  return <PortalLoginPage portal="executives" searchParams={searchParams} />;
}

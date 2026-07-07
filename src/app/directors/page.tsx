import type { Metadata } from "next";
import { PortalLoginPage } from "@/components/portal-login-page";
import { storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-dynamic";

const directorApp = storeApps.director;

export const metadata: Metadata = {
  title: `${directorApp.appStoreName} Login | The BEE Suite`,
  applicationName: directorApp.appStoreName,
  description: directorApp.description,
  manifest: directorApp.manifestPath,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: directorApp.shortName,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function DirectorsLoginPage({ searchParams }: PageProps) {
  return <PortalLoginPage portal="directors" searchParams={searchParams} />;
}

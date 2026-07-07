import type { Metadata } from "next";
import { PortalLoginPage } from "@/components/portal-login-page";
import { storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-dynamic";

const parentApp = storeApps.parent;

export const metadata: Metadata = {
  title: `Parent Portal Setup | ${parentApp.appStoreName}`,
  applicationName: parentApp.appStoreName,
  description: "Parent and guardian setup login for The BEE Suite parent portal.",
  manifest: parentApp.manifestPath,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: parentApp.shortName,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function ParentsSetupLoginPage({ searchParams }: PageProps) {
  return <PortalLoginPage portal="parents" searchParams={searchParams} defaultNextPath="/parent-portal/setup" />;
}

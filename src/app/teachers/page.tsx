import type { Metadata } from "next";
import { PortalLoginPage } from "@/components/portal-login-page";
import { storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-dynamic";

const teacherApp = storeApps.teacher;

export const metadata: Metadata = {
  title: `${teacherApp.appStoreName} Login | The BEE Suite`,
  applicationName: teacherApp.appStoreName,
  description: teacherApp.description,
  manifest: teacherApp.manifestPath,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: teacherApp.shortName,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeachersLoginPage({ searchParams }: PageProps) {
  return <PortalLoginPage portal="teachers" searchParams={searchParams} />;
}

import { CenterCheckInKiosk } from "@/app/check-in/[centerId]/center-check-in-kiosk";

export const dynamic = "force-dynamic";

export default async function FamilyCheckInPage({
  params,
}: {
  params: Promise<{ centerId: string }>;
}) {
  const { centerId } = await params;
  return <CenterCheckInKiosk centerId={centerId} initialMode="family" familyOnly />;
}

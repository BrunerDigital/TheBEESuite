import { CenterCheckInKiosk } from "@/app/check-in/[centerId]/center-check-in-kiosk";

export const dynamic = "force-dynamic";

export default async function CheckInKioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ centerId: string }>;
  searchParams: Promise<{ mode?: string | string[] | undefined }>;
}) {
  const { centerId } = await params;
  const query = await searchParams;
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  return <CenterCheckInKiosk centerId={centerId} initialMode={requestedMode === "staff" ? "staff" : "family"} />;
}

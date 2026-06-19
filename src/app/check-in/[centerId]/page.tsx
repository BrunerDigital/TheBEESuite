import { notFound } from "next/navigation";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { prisma } from "@/lib/prisma";

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
  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
    },
  });

  if (!center) notFound();

  return (
    <KioskCheckIn
      initialMode={requestedMode === "staff" ? "staff" : "family"}
      center={{
        id: center.id,
        name: center.crmLocationId ?? center.name,
        place: [center.city, center.state].filter(Boolean).join(", "),
      }}
    />
  );
}

import { notFound } from "next/navigation";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CheckInKioskPage({ params }: { params: Promise<{ centerId: string }> }) {
  const { centerId } = await params;
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
      center={{
        id: center.id,
        name: center.crmLocationId ?? center.name,
        place: [center.city, center.state].filter(Boolean).join(", "),
      }}
    />
  );
}

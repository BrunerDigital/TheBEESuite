import { notFound } from "next/navigation";
import { KioskCheckIn } from "@/components/kiosk-check-in";
import { readCenterLocationTimeZone } from "@/lib/attendance-state";
import { prisma } from "@/lib/prisma";

type Props = {
  centerId: string;
  initialMode?: "family" | "staff";
  familyOnly?: boolean;
};

export async function CenterCheckInKiosk({
  centerId,
  initialMode = "family",
  familyOnly = false,
}: Props) {
  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
      postalCode: true,
      timezone: true,
      customFields: true,
    },
  });

  if (!center) notFound();

  return (
    <KioskCheckIn
      initialMode={familyOnly ? "family" : initialMode}
      familyOnly={familyOnly}
      center={{
        id: center.id,
        name: center.crmLocationId ?? center.name,
        place: [center.city, center.state].filter(Boolean).join(", "),
        timeZone: readCenterLocationTimeZone(center),
      }}
    />
  );
}

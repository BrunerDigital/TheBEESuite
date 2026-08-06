import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ legacyPath?: string[] }>;
};

export default async function LegacyParentPortalRoute({ params }: PageProps) {
  const { legacyPath } = await params;

  if (legacyPath && legacyPath.length > 0) {
    const firstSegment = legacyPath[0].toLowerCase();
    if (firstSegment === "setup") {
      redirect("/parents/setup");
    }
    if (firstSegment === "login") {
      redirect("/parents");
    }
    redirect("/parents");
  }

  redirect("/parents");
}


import type { Metadata } from "next";
import { renderAuthenticatedModulePage } from "../[slug]/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teacher Portal | The BEE Suite",
};

type TeacherPortalPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeacherPortalPage({ searchParams }: TeacherPortalPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  return renderAuthenticatedModulePage("teacher-portal", resolvedSearchParams);
}

import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthLikePage, ModulePage } from "@/components/module-page";
import { getModule, modules } from "@/lib/demo-data";

export function generateStaticParams() {
  return [
    ...modules.map((module) => ({ slug: module.slug })),
    { slug: "login" },
    { slug: "forgot-password" },
    { slug: "onboarding" },
  ];
}

export default async function SlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === "login" || slug === "forgot-password" || slug === "onboarding") {
    return <AuthLikePage type={slug} />;
  }

  const productModule = getModule(slug);

  if (!productModule) {
    notFound();
  }

  return (
    <AppShell>
      <ModulePage module={productModule} />
    </AppShell>
  );
}

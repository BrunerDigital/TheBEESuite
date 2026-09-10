import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { safeLoginNextPath } from "@/lib/login-routing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot Password | The BEE Suite",
  description: "Request a secure password reset link for your BEE Suite account.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  return <ForgotPasswordForm initialNext={safeLoginNextPath(resolvedSearchParams.next, "")} />;
}

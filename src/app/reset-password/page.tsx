import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset Password | The BEE Suite",
  description: "Create or update the private password for your BEE Suite account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

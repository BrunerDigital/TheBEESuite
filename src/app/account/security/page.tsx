import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRequiresMfa } from "@/lib/mfa-policy";
import { MfaSettings } from "@/components/mfa-settings";

export default async function AccountSecurityPage() {
  const user = await getCurrentUser({ allowMfaEnrollment: true });
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity");
  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/dashboard" className="text-sm underline">Back to your workspace</Link>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Account security</h1>
      <p className="text-muted-foreground">Protect your sign-in with an authenticator app.</p></header>
    <MfaSettings required={roleRequiresMfa(user.role)} />
  </main>;
}

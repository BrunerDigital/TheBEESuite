import { AccountPasswordChangeForm } from "@/components/account-password-change-form";
import { isFteOnlyUser } from "@/lib/application-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRequiresMfa } from "@/lib/mfa-policy";
import { MfaSettings } from "@/components/mfa-settings";
import { homePathForRole } from "@/lib/login-routing";

export default async function AccountSecurityPage() {
  const user = await getCurrentUser({ allowMfaEnrollment: true, accessPurpose: "account_security" });
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity");
  const passwordChangeAllowed = isFteOnlyUser(user)
    ? Boolean(await getCurrentUser({ accessPurpose: "account_security" }))
    : false;
  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-8 sm:px-6">
    <Link href={isFteOnlyUser(user) ? "/fte-reports" : homePathForRole(user.role)} className="text-sm underline">Back to your workspace</Link>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Account security</h1>
      <p className="text-muted-foreground">Protect your sign-in with an authenticator app.</p></header>
    <MfaSettings required={roleRequiresMfa(user.role)} />
    {isFteOnlyUser(user) ? passwordChangeAllowed ? <AccountPasswordChangeForm /> : <p>Finish authenticator setup and sign in again before changing your password.</p> : null}
  </main>;
}

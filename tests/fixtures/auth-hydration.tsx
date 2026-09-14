import { LoginForm } from "../../src/components/login-form";
import { ForgotPasswordForm } from "../../src/components/forgot-password-form";
import { ResetPasswordForm } from "../../src/components/reset-password-form";
import { GuardianPinManager } from "../../src/components/guardian-pin-manager";
import { OnlineRegistrationForm } from "../../src/components/online-registration-form";

export function AuthFixture({ kind }: { kind: string }) {
  if (kind === "pin") return <GuardianPinManager guardianId="synthetic" guardianName="Synthetic guardian" familyName="Synthetic family" />;
  if (kind === "registration") return <OnlineRegistrationForm centers={[]} />;
  if (kind === "forgot") return <ForgotPasswordForm />;
  if (kind === "reset") return <ResetPasswordForm />;
  return <LoginForm portal="directors" />;
}

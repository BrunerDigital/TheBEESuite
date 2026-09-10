import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding-flow";

export const metadata: Metadata = {
  title: "Organization Onboarding | The BEE Suite",
  description: "Set up a childcare organization and its first BEE Suite workspace.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}

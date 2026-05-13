import { AppShell } from "@/components/app-shell";
import { ExecutiveDashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <AppShell>
      <ExecutiveDashboard />
    </AppShell>
  );
}

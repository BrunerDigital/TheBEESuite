"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeOwnerLoginInput } from "@/lib/school-owner-access";

type School = { id: string; name: string; crmLocationId: string | null; status: string };

export function OwnerLoginPanel({ centers }: { centers: School[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "", centerIds: [] as string[] });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const schools = centers.filter((school) => ["active", "trial_setup", "paused"].includes(school.status));
  function submit() {
    setError(""); setMessage("");
    let input: ReturnType<typeof normalizeOwnerLoginInput>;
    try { input = normalizeOwnerLoginInput(form); } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the owner details."); return; }
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/executive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createOwnerLogin", ...input }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Owner setup failed.");
        setMessage(`Owner login created for ${input.email} with ${input.centerIds.length} assigned school(s). Sign in at /login?next=/owner. The temporary password must be changed on first login.`);
        setForm({ name: "", email: "", password: "", centerIds: [] });
        router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Owner setup failed."); }
    });
  }
  return <Card id="owner-logins">
    <CardHeader><CardTitle as="h2">Owner / tenant logins</CardTitle><CardDescription>Create a separate owner login with director tools for the schools selected below. Owners can complete Stripe setup, manage payouts, import families, and configure their schools.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="owner-login-name">Owner name</Label><Input id="owner-login-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="owner-login-email">Owner email</Label><Input id="owner-login-email" type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="owner-login-password">Temporary password</Label><Input id="owner-login-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><p className="text-xs text-muted-foreground">At least 12 characters; share securely with the owner.</p></div>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Assigned schools</legend><div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
          {schools.map((school) => <label key={school.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.centerIds.includes(school.id)} onChange={(event) => setForm({ ...form, centerIds: event.target.checked ? [...form.centerIds, school.id] : form.centerIds.filter((id) => id !== school.id) })} />{school.crmLocationId || school.name}</label>)}
        </div></fieldset>
        <p className="text-sm text-muted-foreground">Selected: {form.centerIds.length} school(s). Verify these assignments against the owner directory before creating the login.</p>
        <Button type="button" disabled={pending || !form.centerIds.length} onClick={submit}>{pending ? "Creating owner login…" : "Create owner login"}</Button>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </CardContent>
  </Card>;
}

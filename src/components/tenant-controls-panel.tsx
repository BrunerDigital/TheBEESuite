"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Globe2, Image as ImageIcon, KeyRound, Save, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type TenantCustomizationControl = {
  id: string;
  scopeType: string;
  brandId: string | null;
  ownerGroupId: string | null;
  centerId: string | null;
  brandName: string;
  logoUrlPlaceholder: string | null;
  faviconUrlPlaceholder: string | null;
  mascotUrlPlaceholder: string | null;
  primaryColor: string;
  accentColor: string;
  themeMode: string;
  emailSenderPlaceholder: string | null;
  customDomainPlaceholder: string | null;
  parentPortalName: string | null;
  loginScreenTitle: string | null;
  notificationFooterText: string | null;
  legalFooterText: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  customCss: unknown;
  containerLabel: string;
};

export type TenantAssetControl = {
  id: string;
  assetType: string;
  url: string | null;
  storageKey: string | null;
  altText: string | null;
  brandId: string | null;
  ownerGroupId: string | null;
  centerId: string | null;
  containerLabel: string;
};

export type TenantContainerOption = {
  id: string;
  label: string;
};

export type SupportAccessAuditRow = {
  id: string;
  action: string;
  resourceId: string | null;
  createdAt: string;
  actor: string;
  metadata: unknown;
};

type FeatureFlagDraft = Record<string, { enabled: boolean; rollout: string; note: string }>;

type Props = {
  canManage: boolean;
  customizations: TenantCustomizationControl[];
  assets: TenantAssetControl[];
  brands: TenantContainerOption[];
  ownerGroups: TenantContainerOption[];
  centers: TenantContainerOption[];
  supportRequests: SupportAccessAuditRow[];
};

const featureDefinitions = [
  ["inquiry_crm", "Inquiry + CRM", "Public forms, routing, lead board, tasks, tours, and follow-up."],
  ["online_registration", "Online Registration", "Parent registration packets and enrollment review."],
  ["fte_reporting", "FTE Reporting", "Weekly school submissions, executive review, and exports."],
  ["attendance_kiosk", "Attendance + Kiosk", "Guardian PIN/QR check-in, signatures, warnings, reconciliation."],
  ["teacher_portal", "Teacher Portal", "Classroom roster, daily logs, incidents, media, and offline queue."],
  ["parent_portal", "Parent Portal", "Family dashboard, reports, documents, messages, and preferences."],
  ["billing_payments", "Billing + Payments", "Tuition plans, invoices, ledger, Stripe checkout, and dunning."],
  ["documents_signatures", "Documents + Signatures", "Required checklist, uploads, review, reminders, and e-signature."],
  ["messaging_sms_email", "Messaging", "Email, SMS, announcements, campaigns, and templates."],
  ["compliance_medication", "Compliance + Medication", "Licensing configuration, incident review, medication logs, exports."],
  ["marketing_automations", "Marketing + Automations", "Campaigns, reviews, surveys, and workflow builder."],
  ["ai_assistant", "AI Assistant", "Mr. Bee summaries and drafts with human review gates."],
] as const;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function featureFlagsFromCustomization(customization: TenantCustomizationControl | null): FeatureFlagDraft {
  const css = objectValue(customization?.customCss);
  const stored = objectValue(css.featureFlags);
  return Object.fromEntries(
    featureDefinitions.map(([key]) => {
      const row = objectValue(stored[key]);
      return [
        key,
        {
          enabled: row.enabled === true,
          rollout: typeof row.rollout === "string" ? row.rollout : "disabled",
          note: typeof row.note === "string" ? row.note : "",
        },
      ];
    }),
  );
}

function domainVerification(value: unknown) {
  const record = objectValue(objectValue(value).domainVerification);
  return {
    status: typeof record.status === "string" ? record.status : "",
    txtRecordName: typeof record.txtRecordName === "string" ? record.txtRecordName : "",
    txtRecordValue: typeof record.txtRecordValue === "string" ? record.txtRecordValue : "",
    requestedAt: typeof record.requestedAt === "string" ? record.requestedAt : "",
  };
}

function supportSummary(value: unknown) {
  const metadata = objectValue(value);
  return {
    targetLabel: typeof metadata.targetLabel === "string" ? metadata.targetLabel : "Tenant",
    reason: typeof metadata.reason === "string" ? metadata.reason : "",
    durationHours: typeof metadata.durationHours === "number" ? metadata.durationHours : 0,
    status: typeof metadata.status === "string" ? metadata.status : "requested",
  };
}

function emptyCustomization(): TenantCustomizationControl {
  return {
    id: "",
    scopeType: "TENANT",
    brandId: null,
    ownerGroupId: null,
    centerId: null,
    brandName: "",
    logoUrlPlaceholder: "",
    faviconUrlPlaceholder: "",
    mascotUrlPlaceholder: "/mr-bee.png",
    primaryColor: "#f5b51b",
    accentColor: "#10b981",
    themeMode: "dark",
    emailSenderPlaceholder: "",
    customDomainPlaceholder: "",
    parentPortalName: "",
    loginScreenTitle: "",
    notificationFooterText: "",
    legalFooterText: "",
    termsUrl: "",
    privacyUrl: "",
    customCss: {},
    containerLabel: "New tenant layer",
  };
}

export function TenantControlsPanel({ canManage, customizations, assets, brands, ownerGroups, centers, supportRequests }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"branding" | "features" | "domain" | "assets" | "support">("branding");
  const [selectedCustomizationId, setSelectedCustomizationId] = useState(customizations[0]?.id ?? "new");
  const selectedCustomization = useMemo(
    () => customizations.find((customization) => customization.id === selectedCustomizationId) ?? null,
    [customizations, selectedCustomizationId],
  );
  const [branding, setBranding] = useState<TenantCustomizationControl>(selectedCustomization ?? emptyCustomization());
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagDraft>(featureFlagsFromCustomization(selectedCustomization));
  const [domain, setDomain] = useState(selectedCustomization?.customDomainPlaceholder ?? "");
  const [assetDraft, setAssetDraft] = useState({
    assetType: "logo_primary",
    scopeType: "TENANT",
    brandId: brands[0]?.id ?? "",
    ownerGroupId: "",
    centerId: "",
    url: "",
    storageKey: "",
    altText: "",
  });
  const [supportDraft, setSupportDraft] = useState({
    targetScope: "tenant",
    targetId: "",
    durationHours: "2",
    emergency: false,
    reason: "",
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [verification, setVerification] = useState(domainVerification(selectedCustomization?.customCss));
  const [isPending, startTransition] = useTransition();

  function chooseCustomization(value: string | null) {
    const id = value ?? "new";
    setSelectedCustomizationId(id);
    setStatus("");
    setError("");
    if (id === "new") {
      const draft = emptyCustomization();
      setBranding(draft);
      setFeatureFlags(featureFlagsFromCustomization(null));
      setDomain("");
      setVerification(domainVerification({}));
      return;
    }
    const customization = customizations.find((item) => item.id === id);
    if (!customization) return;
    setBranding(customization);
    setFeatureFlags(featureFlagsFromCustomization(customization));
    setDomain(customization.customDomainPlaceholder ?? "");
    setVerification(domainVerification(customization.customCss));
  }

  function post(body: Record<string, unknown>, success: string) {
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await fetch("/api/tenant-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null) as { error?: string; record?: { id?: string }; verification?: typeof verification } | null;
      if (!response.ok) {
        setError(json?.error || "Tenant control could not be saved.");
        return;
      }
      if (json?.record?.id) setSelectedCustomizationId(json.record.id);
      if (json?.verification) setVerification(json.verification);
      setStatus(success);
      router.refresh();
    });
  }

  const tabs = [
    ["branding", Sparkles, "Branding"],
    ["features", SlidersHorizontal, "Features"],
    ["domain", Globe2, "Domain"],
    ["assets", ImageIcon, "Assets"],
    ["support", ShieldAlert, "Support"],
  ] as const;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Tenant Controls</CardTitle>
            <CardDescription>Configure feature availability, branding layers, domain verification, asset references, and audited support-access requests.</CardDescription>
          </div>
          <Badge variant={canManage ? "default" : "outline"}>
            <KeyRound data-icon="inline-start" />
            {canManage ? "Admin editable" : "Read only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([value, Icon, label]) => (
            <Button key={value} type="button" variant={tab === value ? "default" : "outline"} size="sm" onClick={() => setTab(value)}>
              <Icon data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </div>
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label>Customization layer</Label>
            <Select value={selectedCustomizationId} onValueChange={chooseCustomization}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New customization layer</SelectItem>
                {customizations.map((customization) => (
                  <SelectItem key={customization.id} value={customization.id}>{customization.scopeType}: {customization.containerLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Selected scope</Label>
            <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2 text-sm">
              <Badge variant="outline">{branding.scopeType}</Badge>
              <span className="truncate">{branding.containerLabel}</span>
            </div>
          </div>
        </div>

        {tab === "branding" ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Scope</Label>
                <Select value={branding.scopeType} onValueChange={(value) => value && setBranding((current) => ({ ...current, scopeType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TENANT">Tenant</SelectItem>
                    <SelectItem value="BRAND">Brand</SelectItem>
                    <SelectItem value="OWNER_GROUP">Owner group</SelectItem>
                    <SelectItem value="CENTER">School</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Brand</Label>
                <Select value={branding.brandId ?? brands[0]?.id ?? ""} onValueChange={(value) => setBranding((current) => ({ ...current, brandId: value ?? null }))}>
                  <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {branding.scopeType === "OWNER_GROUP" ? (
                <div className="space-y-1">
                  <Label>Owner group</Label>
                  <Select value={branding.ownerGroupId ?? ""} onValueChange={(value) => setBranding((current) => ({ ...current, ownerGroupId: value ?? null }))}>
                    <SelectTrigger><SelectValue placeholder="Choose owner" /></SelectTrigger>
                    <SelectContent>
                      {ownerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {branding.scopeType === "CENTER" ? (
                <div className="space-y-1">
                  <Label>School</Label>
                  <Select value={branding.centerId ?? ""} onValueChange={(value) => setBranding((current) => ({ ...current, centerId: value ?? null }))}>
                    <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
                    <SelectContent>
                      {centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>Theme</Label>
                <Select value={branding.themeMode} onValueChange={(value) => value && setBranding((current) => ({ ...current, themeMode: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Brand name</Label>
                <Input value={branding.brandName} onChange={(event) => setBranding((current) => ({ ...current, brandName: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Primary color</Label>
                <Input value={branding.primaryColor} onChange={(event) => setBranding((current) => ({ ...current, primaryColor: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Accent color</Label>
                <Input value={branding.accentColor} onChange={(event) => setBranding((current) => ({ ...current, accentColor: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Parent portal name</Label>
                <Input value={branding.parentPortalName ?? ""} onChange={(event) => setBranding((current) => ({ ...current, parentPortalName: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Login title</Label>
                <Input value={branding.loginScreenTitle ?? ""} onChange={(event) => setBranding((current) => ({ ...current, loginScreenTitle: event.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Email sender</Label>
                <Input value={branding.emailSenderPlaceholder ?? ""} onChange={(event) => setBranding((current) => ({ ...current, emailSenderPlaceholder: event.target.value }))} placeholder="The BEE Suite <hello@example.com>" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Terms URL</Label>
                <Input value={branding.termsUrl ?? ""} onChange={(event) => setBranding((current) => ({ ...current, termsUrl: event.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Privacy URL</Label>
                <Input value={branding.privacyUrl ?? ""} onChange={(event) => setBranding((current) => ({ ...current, privacyUrl: event.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-4">
                <Label>Legal footer</Label>
                <Textarea value={branding.legalFooterText ?? ""} onChange={(event) => setBranding((current) => ({ ...current, legalFooterText: event.target.value }))} />
              </div>
            </div>
            <Button disabled={!canManage || isPending} onClick={() => post({ action: "saveCustomization", ...branding, id: branding.id || undefined }, "Brand customization saved.")}>
              <Save data-icon="inline-start" />
              Save Branding
            </Button>
          </div>
        ) : null}

        {tab === "features" ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featureDefinitions.map(([key, label, detail]) => {
                const row = featureFlags[key] ?? { enabled: false, rollout: "disabled", note: "" };
                return (
                  <div key={key} className="rounded-lg border bg-background/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{label}</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                      </div>
                      <Switch checked={row.enabled} onCheckedChange={(checked) => setFeatureFlags((current) => ({ ...current, [key]: { ...row, enabled: checked, rollout: checked ? row.rollout === "disabled" ? "pilot" : row.rollout : "disabled" } }))} />
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Select value={row.rollout} onValueChange={(value) => value && setFeatureFlags((current) => ({ ...current, [key]: { ...row, rollout: value } }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="pilot">Pilot only</SelectItem>
                          <SelectItem value="school">Selected schools</SelectItem>
                          <SelectItem value="all">All schools</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={row.note} onChange={(event) => setFeatureFlags((current) => ({ ...current, [key]: { ...row, note: event.target.value } }))} placeholder="Launch note or blocker" />
                    </div>
                  </div>
                );
              })}
            </div>
            <Button disabled={!canManage || isPending} onClick={() => post({ action: "saveFeatureFlags", customizationId: selectedCustomizationId === "new" ? undefined : selectedCustomizationId, featureFlags }, "Feature flags saved.")}>
              <Save data-icon="inline-start" />
              Save Feature Flags
            </Button>
          </div>
        ) : null}

        {tab === "domain" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3 rounded-lg border bg-background/40 p-4">
              <div className="space-y-1">
                <Label>Custom domain</Label>
                <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="portal.schoolbrand.com" />
              </div>
              <Button disabled={!canManage || isPending || selectedCustomizationId === "new"} onClick={() => post({ action: "requestDomainVerification", customizationId: selectedCustomizationId, domain }, "Domain verification requested.")}>
                <Globe2 data-icon="inline-start" />
                Request Verification
              </Button>
            </div>
            <div className="rounded-lg border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">DNS checklist</div>
                <Badge variant={verification.status ? "outline" : "secondary"}>{verification.status || "Not requested"}</Badge>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">TXT name</div>
                  <div className="font-mono text-xs">{verification.txtRecordName || "Request verification to generate DNS values"}</div>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">TXT value</div>
                  <div className="font-mono text-xs">{verification.txtRecordValue || "Pending"}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "assets" ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Asset type</Label>
                <Input value={assetDraft.assetType} onChange={(event) => setAssetDraft((current) => ({ ...current, assetType: event.target.value }))} placeholder="logo_primary" />
              </div>
              <div className="space-y-1">
                <Label>Scope</Label>
                <Select value={assetDraft.scopeType} onValueChange={(value) => value && setAssetDraft((current) => ({ ...current, scopeType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TENANT">Tenant</SelectItem>
                    <SelectItem value="BRAND">Brand</SelectItem>
                    <SelectItem value="OWNER_GROUP">Owner group</SelectItem>
                    <SelectItem value="CENTER">School</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {assetDraft.scopeType === "OWNER_GROUP" ? (
                <div className="space-y-1">
                  <Label>Owner group</Label>
                  <Select value={assetDraft.ownerGroupId} onValueChange={(value) => setAssetDraft((current) => ({ ...current, ownerGroupId: value ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Choose owner" /></SelectTrigger>
                    <SelectContent>{ownerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              {assetDraft.scopeType === "CENTER" ? (
                <div className="space-y-1">
                  <Label>School</Label>
                  <Select value={assetDraft.centerId} onValueChange={(value) => setAssetDraft((current) => ({ ...current, centerId: value ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
                    <SelectContent>{centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1 md:col-span-2">
                <Label>Public URL</Label>
                <Input value={assetDraft.url} onChange={(event) => setAssetDraft((current) => ({ ...current, url: event.target.value }))} placeholder="/brand/example/logo.png" />
              </div>
              <div className="space-y-1">
                <Label>Storage key</Label>
                <Input value={assetDraft.storageKey} onChange={(event) => setAssetDraft((current) => ({ ...current, storageKey: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Alt text</Label>
                <Input value={assetDraft.altText} onChange={(event) => setAssetDraft((current) => ({ ...current, altText: event.target.value }))} />
              </div>
            </div>
            <Button disabled={!canManage || isPending} onClick={() => post({ action: "saveAsset", ...assetDraft }, "Brand asset saved.")}>
              <Save data-icon="inline-start" />
              Save Asset Reference
            </Button>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.slice(0, 8).map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.assetType.replaceAll("_", " ")}</TableCell>
                    <TableCell>{asset.containerLabel}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">{asset.storageKey ?? asset.url}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {tab === "support" ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertTitle>Support access is request-only</AlertTitle>
              <AlertDescription>This workflow records a scoped request and audit trail. It does not grant impersonation, bypass permissions, or expose data without a separate approval process.</AlertDescription>
            </Alert>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Target scope</Label>
                <Select value={supportDraft.targetScope} onValueChange={(value) => value && setSupportDraft((current) => ({ ...current, targetScope: value, targetId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="ownerGroup">Owner group</SelectItem>
                    <SelectItem value="center">School</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {supportDraft.targetScope === "ownerGroup" ? (
                <div className="space-y-1">
                  <Label>Owner group</Label>
                  <Select value={supportDraft.targetId} onValueChange={(value) => setSupportDraft((current) => ({ ...current, targetId: value ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Choose owner" /></SelectTrigger>
                    <SelectContent>{ownerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              {supportDraft.targetScope === "center" ? (
                <div className="space-y-1">
                  <Label>School</Label>
                  <Select value={supportDraft.targetId} onValueChange={(value) => setSupportDraft((current) => ({ ...current, targetId: value ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
                    <SelectContent>{centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>Duration hours</Label>
                <Input value={supportDraft.durationHours} onChange={(event) => setSupportDraft((current) => ({ ...current, durationHours: event.target.value }))} inputMode="numeric" />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" checked={supportDraft.emergency} onChange={(event) => setSupportDraft((current) => ({ ...current, emergency: event.target.checked }))} />
                Emergency support
              </label>
              <div className="space-y-1 md:col-span-4">
                <Label>Reason</Label>
                <Textarea value={supportDraft.reason} onChange={(event) => setSupportDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Describe the support issue, affected school, and exact data/workflow needed." />
              </div>
            </div>
            <Button disabled={!canManage || isPending} onClick={() => post({ action: "requestSupportAccess", ...supportDraft }, "Support access request recorded in audit logs.")}>
              <ShieldAlert data-icon="inline-start" />
              Record Support Request
            </Button>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supportRequests.map((request) => {
                  const summary = supportSummary(request.metadata);
                  return (
                    <TableRow key={request.id}>
                      <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{request.actor}</TableCell>
                      <TableCell>{summary.targetLabel}</TableCell>
                      <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">{summary.reason}</TableCell>
                      <TableCell><Badge variant="outline">{summary.status} · {summary.durationHours || 0}h</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {!supportRequests.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">No support-access requests are recorded yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

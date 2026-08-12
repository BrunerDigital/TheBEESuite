"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileLock2,
  Lock,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { integrations, ModuleDefinition, roleMatrix } from "@/lib/demo-data";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export function ModulePage({ module }: { module: ModuleDefinition }) {
  const [quickRecordSaved, setQuickRecordSaved] = useState(false);
  const primaryHref = module.slug === "school-setup" ? "/school-setup" : `/${module.slug}?action=new`;
  const quickRecordId = `${module.slug}-quick-record`;
  const quickCenterId = `${module.slug}-quick-center`;
  const quickNotesId = `${module.slug}-quick-notes`;
  const humanReviewId = `${module.slug}-human-review`;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{module.eyebrow}</Badge>
              <Badge variant="outline">{module.owner}</Badge>
              {module.sensitive ? (
                <Badge className="gap-1">
                  <Lock data-icon="inline-start" />
                  Restricted fields
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">{module.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{module.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href={primaryHref} />}>
                <Plus data-icon="inline-start" />
                Start setup
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/audit-logs?resource=${encodeURIComponent(module.slug)}`} />}>
                View audit trail
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-base">Optional AI support</CardTitle>
              <CardDescription>Suggestions stay separate from saved records and require review.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {module.ai ?? "AI can summarize records, draft copy, prioritize tasks, and recommend next steps for human review."}
            </CardContent>
          </Card>
        </div>
      </section>

      {module.sensitive ? (
        <Alert className="border-amber-400/30 bg-amber-400/10">
          <FileLock2 />
          <AlertTitle>Access-controlled information</AlertTitle>
          <AlertDescription>
            Sensitive child, custody, medical, safety, billing, and compliance fields should be encrypted where appropriate, filtered by RBAC, and recorded in audit logs.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {module.metrics.map((metric) => (
          <Card key={metric}>
            <CardHeader>
              <CardTitle as="div" className="text-xl">{metric}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="workspace" className="flex flex-col gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
            <Card>
              <CardHeader>
                <CardTitle as="h2">Available tools</CardTitle>
                <CardDescription>Controls and connected workflows for this module</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {module.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-xl border bg-background/50 p-4">
                    <CheckCircle2 className="mt-0.5 text-primary" />
                    <div className="text-sm font-medium">{feature}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h2">Quick form</CardTitle>
                <CardDescription>Create a temporary draft for review</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={quickRecordId}>Family or record name</Label>
                  <Input id={quickRecordId} name="recordName" placeholder="Family, lead, or record name" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={quickCenterId}>Center</Label>
                  <Select defaultValue="Current center">
                    <SelectTrigger id={quickCenterId}>
                      <SelectValue placeholder="Choose center" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="Current center">Current center</SelectItem>
                        <SelectItem value="Additional center">Additional center</SelectItem>
                        <SelectItem value="Regional view">Regional view</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={quickNotesId}>Internal notes</Label>
                  <Textarea id={quickNotesId} name="notes" placeholder="Add a role-scoped note…" />
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background/50 p-3">
                  <div>
                    <Label htmlFor={humanReviewId} className="text-sm font-medium">Require human review</Label>
                    <p className="text-xs text-muted-foreground">Recommended for sensitive workflows</p>
                  </div>
                  <Switch id={humanReviewId} defaultChecked />
                </div>
                <Button type="button" onClick={() => setQuickRecordSaved(true)}>Save draft</Button>
                {quickRecordSaved ? (
                  <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                    Draft saved in this workspace view. Use the module action above to create the permanent record.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="records" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Setup records</CardTitle>
              <CardDescription>Configured records for this module surface</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Audit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {module.records.slice(0, 10).map((record, index) => (
                    <TableRow key={record}>
                      <TableCell className="font-medium">{record}</TableCell>
                      <TableCell>
                        <Badge variant={index % 3 === 0 ? "default" : "secondary"}>{index % 3 === 0 ? "Needs review" : "Active"}</Badge>
                      </TableCell>
                      <TableCell>{module.owner.split(",")[0]}</TableCell>
                      <TableCell className="text-muted-foreground">event_{String(index + 1).padStart(3, "0")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="builder" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            {["Trigger", "Condition", "Action"].map((label, index) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle as="h2">{label}</CardTitle>
                  <CardDescription>Workflow setup step</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {["New inquiry submitted", "Missing document", "Notify director"].map((item, itemIndex) => (
                      <div key={item} className="rounded-xl border bg-background/50 p-3">
                        <div className="text-sm font-medium">{index === itemIndex ? item : `${label} example ${itemIndex + 1}`}</div>
                      <p className="mt-1 text-xs text-muted-foreground">Example used when planning a saved workflow for this module.</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="security" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle as="h2">Role-based access model</CardTitle>
                <CardDescription>Multi-tenant hierarchy and permission boundaries</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {roleMatrix.slice(0, 10).map(([role, scope]) => (
                  <div key={role} className="rounded-xl border bg-background/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldCheck className="text-primary" />
                      {role}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{scope}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h2">Integration readiness</CardTitle>
                <CardDescription>Connected services and credential status</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {integrations.slice(0, 6).map(([name, purpose, status]) => (
                  <div key={name} className="rounded-xl border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{name}</span>
                      <Badge variant="outline">{status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{purpose}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Alert>
        <AlertTriangle />
        <AlertTitle>Review before launch</AlertTitle>
        <AlertDescription>
          Confirm role access, audit history, external integrations, and school-specific settings before using this workflow with live families, staff, billing, or compliance records.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function AuthLikePage({ type, nextPath = "" }: { type: "login" | "forgot-password" | "onboarding"; nextPath?: string }) {
  const isLogin = type === "login";
  const isForgot = type === "forgot-password";

  if (isForgot) {
    return (
      <Suspense fallback={null}>
        <ForgotPasswordForm initialNext={nextPath} />
      </Suspense>
    );
  }

  return (
    <div className="auth-halo-shell grid min-h-screen place-items-center p-4" data-portal={type}>
      <Card className="auth-halo-card w-full max-w-xl">
        <CardHeader className="text-center">
          <CardTitle as="h1" className="mt-4 text-3xl">
            {isLogin ? "Welcome to The BEE Suite" : isForgot ? "Reset your password" : "Set up your childcare brand"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Secure login for directors, teachers, parents, and platform teams."
              : "Configure organization hierarchy, centers, white-label settings, and first workflows."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${type}-email`}>Email</Label>
            <Input id={`${type}-email`} name="email" placeholder="director@school.example" type="email" autoComplete="email" />
          </div>
          {!isForgot ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${type}-password`}>Password</Label>
              <Input id={`${type}-password`} name="password" placeholder="Password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} />
            </div>
          ) : null}
          {type === "onboarding" ? (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                {["Brand", "Organization", "Centers", "Roles"].map((step) => (
                  <div key={step} className="rounded-xl border bg-background/50 p-3">
                    <div className="text-sm font-medium">{step}</div>
                    <p className="text-xs text-muted-foreground">Ready for setup</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <Button nativeButton={false} render={<Link href={isLogin ? "/directors" : "/onboarding"} />}>
            {isLogin ? "Enter workspace" : "Continue onboarding"}
          </Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            Access is scoped by role, center, organization, and tenant before sensitive workflows are shown.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

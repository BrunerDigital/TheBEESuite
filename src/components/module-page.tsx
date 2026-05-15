"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileLock2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { integrations, ModuleDefinition, roleMatrix } from "@/lib/demo-data";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export function ModulePage({ module }: { module: ModuleDefinition }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
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
              <Button>
                <Plus data-icon="inline-start" />
                Create demo record
              </Button>
              <Button variant="outline">
                View audit trail
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
          <Card className="border-primary/30 bg-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="text-primary" />
                AI assistance
              </CardTitle>
              <CardDescription>Clearly labeled suggestion layer</CardDescription>
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
          <Card key={metric} className="glass-panel">
            <CardHeader className="pb-2">
              <CardDescription>Demo metric</CardDescription>
              <CardTitle className="text-2xl">{metric}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={Math.min(95, 38 + metric.length * 3)} />
            </CardContent>
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
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Feature surface</CardTitle>
                <CardDescription>Production-oriented v1 controls and placeholders</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {module.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-xl border bg-background/50 p-4">
                    <CheckCircle2 className="mt-0.5 text-primary" />
                    <div>
                      <div className="text-sm font-medium">{feature}</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Demo-ready now, with tenant and integration hooks documented for production expansion.
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Quick form</CardTitle>
                <CardDescription>Auth-ready interaction pattern</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="family">Family or record name</Label>
                  <Input id="family" placeholder="Rivera Family" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Center</Label>
                  <Select defaultValue="Kid City USA">
                    <SelectTrigger>
                      <SelectValue placeholder="Choose center" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="Kid City USA">Kid City USA</SelectItem>
                        <SelectItem value="Kid City USA - North">Kid City USA</SelectItem>
                        <SelectItem value="Kid City USA - South">Kid City USA</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes">Internal notes</Label>
                  <Textarea id="notes" placeholder="Add a role-scoped note..." />
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background/50 p-3">
                  <div>
                    <div className="text-sm font-medium">Require human review</div>
                    <p className="text-xs text-muted-foreground">Recommended for sensitive workflows</p>
                  </div>
                  <Switch defaultChecked aria-label="Require human review" />
                </div>
                <Button>Save demo record</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="records" className="mt-0">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Demo records</CardTitle>
              <CardDescription>Seeded examples for this module</CardDescription>
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
              <Card key={label} className="glass-panel">
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                  <CardDescription>Workflow builder foundation</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {["New inquiry submitted", "Missing document", "Notify director"].map((item, itemIndex) => (
                    <div key={item} className="rounded-xl border bg-background/50 p-3">
                      <div className="text-sm font-medium">{index === itemIndex ? item : `${label} option ${itemIndex + 1}`}</div>
                      <p className="mt-1 text-xs text-muted-foreground">Execution logs are placeholders in this v1.</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="security" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Role-based access model</CardTitle>
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
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Integration readiness</CardTitle>
                <CardDescription>Mock services and credential placeholders</CardDescription>
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
        <AlertTitle>Production boundary</AlertTitle>
        <AlertDescription>
          This screen is a working demo foundation. Live credentials, real payment processing, SMS/email sending, signatures, document storage, and final licensing exports remain integration work.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function AuthLikePage({ type }: { type: "login" | "forgot-password" | "onboarding" }) {
  const isLogin = type === "login";
  const isForgot = type === "forgot-password";

  if (isForgot) {
    return <ForgotPasswordForm />;
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="glass-panel w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles />
          </div>
          <CardTitle className="mt-4 text-3xl">
            {isLogin ? "Welcome to The Bee Suite" : isForgot ? "Reset your password" : "Set up your childcare brand"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Auth-ready demo login for directors, teachers, parents, and platform teams."
              : isForgot
                ? "Password reset delivery is a placeholder until an auth provider is connected."
                : "Configure organization hierarchy, centers, white-label settings, and first workflows."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="director@kidcityusa.example" type="email" />
          </div>
          {!isForgot ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" placeholder="Demo mode" type="password" />
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
          <Button>{isLogin ? "Enter demo workspace" : isForgot ? "Send reset placeholder" : "Continue onboarding"}</Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            Demo mode only. Connect Supabase Auth, Clerk, Auth.js, or another provider before production.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

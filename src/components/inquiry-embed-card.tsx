"use client";

import { Clipboard, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type InquiryEmbedCardProps = {
  title: string;
  description: string;
  embedCode: string;
};

export function InquiryEmbedCard({ title, description, embedCode }: InquiryEmbedCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyEmbedCode() {
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <Card className="glass-panel border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clipboard className="text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={embedCode}
          readOnly
          aria-label="Inquiry form embed code"
          className="min-h-36 font-mono text-xs"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            Paste this into the school website, landing page, or marketing platform where inquiries should enter The Bee Suite CRM.
          </p>
          <Button onClick={copyEmbedCode} className="shrink-0">
            {copied ? <CheckCircle2 data-icon="inline-start" /> : <Clipboard data-icon="inline-start" />}
            {copied ? "Copied" : "Copy embed"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

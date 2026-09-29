"use client";

import { useState } from "react";
import { Flag, LoaderCircle, ShieldBan } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MessageReportButton({ messageId, inverse = false }: { messageId: string; inverse?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "reported" | "error">("idle");
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockError, setBlockError] = useState("");
  const router = useRouter();

  async function block() {
    if (!window.confirm("Block this sender? Their messages will be hidden from your inbox and message copies to you will stop. School records are preserved. You can unblock them in Blocked senders. Contact your school directly for urgent safety concerns.")) return;
    setBlocking(true);
    setBlockError("");
    try {
      const response = await fetch(`/api/communications/messages/${encodeURIComponent(messageId)}/block`, { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "The sender could not be blocked. Try again.");
      setBlocked(true);
      router.refresh();
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : "The sender could not be blocked. Try again.");
    } finally { setBlocking(false); }
  }

  async function report() {
    if (!window.confirm("Report this message for a safety or conduct review? The message will be preserved for authorized reviewers.")) return;
    setState("sending");
    try {
      const response = await fetch(`/api/communications/messages/${encodeURIComponent(messageId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "inappropriate_or_abusive" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Report could not be submitted.");
      setState("reported");
    } catch {
      setState("error");
    }
  }

  const label = state === "reported" ? "Reported" : state === "error" ? "Try report again" : "Report";
  return (
    <div>
    <div className="flex flex-wrap gap-1">
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={`mt-2 min-h-11 px-2 text-xs ${inverse ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-muted-foreground"}`}
      disabled={blocking || state === "sending" || state === "reported"}
      aria-label={`${label} this message`}
      onClick={report}
    >
      {state === "sending" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Flag aria-hidden="true" />}
      {state === "sending" ? "Reporting…" : label}
    </Button>
    <Button type="button" size="sm" variant="ghost" className={`mt-2 min-h-11 px-2 text-xs ${inverse ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-muted-foreground"}`} disabled={blocking || blocked || state === "sending"} onClick={() => void block()} aria-label="Block this message sender">
      {blocking ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldBan aria-hidden="true" />}
      {blocking ? "Blocking…" : blocked ? "Blocked" : "Block sender"}
    </Button>
    </div>
    {blockError ? <p role="alert" className="mt-1 text-xs">{blockError}</p> : null}
    </div>
  );
}

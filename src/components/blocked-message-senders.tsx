"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BlockedMessageSenders() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [senders, setSenders] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/communications/blocked-senders", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok || !Array.isArray(result.senders)) throw new Error("Blocked senders could not be loaded. Try again.");
      setSenders(result.senders);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Blocked senders could not be loaded."); }
    finally { setLoading(false); }
  }
  async function unblock(id: string) {
    if (!window.confirm("Unblock this sender? Their messages will appear again and new message copies can resume.")) return;
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/communications/blocked-senders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderId: id }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "The sender could not be unblocked. Try again.");
      setSenders(current => current.filter(sender => sender.id !== id));
      setNotice("Sender unblocked."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The sender could not be unblocked."); }
    finally { setLoading(false); }
  }
  return <div className="px-4 py-2">
    <Button type="button" variant="ghost" size="sm" className="min-h-11" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}><ShieldBan aria-hidden="true" />Blocked senders</Button>
    {open ? <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground">Blocking hides a sender’s messages from your inbox and stops their message copies to you. School records and other recipients are preserved. Use Report for school conduct review; contact your school directly for urgent safety help.</p>
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? <p role="status">Updating blocked senders…</p> : null}
      {!loading && !senders.length && !notice ? <p>No blocked senders.</p> : null}
      {senders.map(sender => <div key={sender.id} className="flex items-center justify-between gap-2"><span>{sender.name}</span><Button type="button" variant="outline" size="sm" className="min-h-11" disabled={loading} onClick={() => void unblock(sender.id)}>Unblock</Button></div>)}
    </div> : null}
  </div>;
}

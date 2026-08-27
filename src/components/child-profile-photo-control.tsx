"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChildProfilePhotoControl({ childId, childName, initialUrl }: { childId: string; childName: string; initialUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await fetch(`/api/children/${encodeURIComponent(childId)}/profile-photo`, { method: "POST", body: formData });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; profilePhotoUrl?: string };
      if (!response.ok || !data.ok || !data.profilePhotoUrl) throw new Error(data.error || "Student profile photo could not be saved.");
      setUrl(data.profilePhotoUrl);
      setMessage("Profile photo saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Student profile photo could not be saved.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/children/${encodeURIComponent(childId)}/profile-photo`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Student profile photo could not be removed.");
      setUrl(null);
      setMessage("Profile photo removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Student profile photo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const initials = childName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "ST";
  return (
    <div className="flex min-w-48 items-center gap-3">
      <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
        {url ? <Image src={url} alt={`${childName} profile`} fill sizes="48px" unoptimized className="object-cover" /> : initials}
      </div>
      <div className="min-w-0 space-y-1">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`Upload profile photo for ${childName}`}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
            {url ? "Replace" : "Add photo"}
          </Button>
          {url ? <Button type="button" size="sm" variant="ghost" onClick={() => void remove()} disabled={busy} aria-label={`Remove profile photo for ${childName}`}><Trash2 /></Button> : null}
        </div>
        {message ? <p className="max-w-48 text-xs text-muted-foreground" aria-live="polite">{message}</p> : null}
      </div>
    </div>
  );
}

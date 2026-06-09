"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DocumentUploadActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function upload() {
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      setMessage("Choose a file first.");
      return;
    }

    startTransition(async () => {
      setMessage("");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("note", note);
      const response = await fetch(`/api/documents/${documentId}/upload`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Document could not be uploaded.");
        return;
      }
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      setMessage("Uploaded for review.");
      router.refresh();
    });
  }

  return (
    <div className="min-w-64 space-y-2">
      <Input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,text/plain"
      />
      <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Upload note" />
      <Button size="sm" variant="outline" disabled={isPending} onClick={upload}>
        <UploadCloud data-icon="inline-start" />
        {isPending ? "Uploading" : "Upload"}
      </Button>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}

"use client";

import { ChangeEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

type ProfilePhotoUploaderProps = {
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
};

export function ProfilePhotoUploader({ name, email, profilePhotoUrl }: ProfilePhotoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState(profilePhotoUrl ?? null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function choosePhoto() {
    inputRef.current?.click();
  }

  function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    startTransition(async () => {
      setMessage("");
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null) as { error?: string; profilePhotoUrl?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Profile photo could not be uploaded.");
        return;
      }
      setPreviewUrl(json?.profilePhotoUrl ?? null);
      setMessage("Profile photo updated.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-3">
        <UserAvatar name={name} src={previewUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={choosePhoto} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Upload
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={uploadPhoto}
        aria-label="Upload profile photo"
      />
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="size-3.5" />
        <span>{message || "JPG, PNG, or WebP. 5MB max."}</span>
      </div>
    </div>
  );
}

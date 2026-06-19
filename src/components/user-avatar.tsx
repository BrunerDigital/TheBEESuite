"use client";

import { DEFAULT_PROFILE_PHOTO_URL } from "@/lib/profile-photo";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeClasses = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
};

export function UserAvatar({ name, src, size = "md", className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full border bg-muted shadow-sm",
        sizeClasses[size],
        className,
      )}
    >
      <img
        src={src || DEFAULT_PROFILE_PHOTO_URL}
        alt={`${name || "User"} profile photo`}
        className="size-full object-cover"
      />
    </span>
  );
}

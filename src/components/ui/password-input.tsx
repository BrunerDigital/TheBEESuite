"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ id, className, visibilityLabel = "password", ...props }: Omit<ComponentProps<typeof Input>, "type"> & { visibilityLabel?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return <div className="relative min-w-0">
    <Input {...props} id={inputId} type={visible ? "text" : "password"} autoCapitalize="none" spellCheck={false} className={cn("pr-[52px]", className)} />
    <button type="button" disabled={props.disabled} aria-controls={inputId}
      aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`}
      className="absolute inset-y-0 right-0 flex min-h-[44px] w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      onPointerDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
    </button>
  </div>;
}

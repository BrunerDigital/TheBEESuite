"use client";

import { useSyncExternalStore, type ComponentProps } from "react";

const subscribe = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

/** Keep credentials out of native GET submissions before React is interactive. */
export function ClientAuthForm({ children, onSubmit, fieldsetClassName = "flex flex-col gap-4", ...props }: Omit<ComponentProps<"form">, "method"> & { fieldsetClassName?: string }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return (
    <form {...props} method="post" onSubmit={event => {
      event.preventDefault();
      if (ready) onSubmit?.(event);
    }}>
      <fieldset disabled={!ready || props["aria-busy"] === true} className={`m-0 min-w-0 border-0 p-0 ${fieldsetClassName}`}>
        {children}
      </fieldset>
      <noscript>Enable JavaScript to use this secure form.</noscript>
    </form>
  );
}

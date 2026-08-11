"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type PushState =
  | "loading"
  | "working"
  | "enabled"
  | "disabled"
  | "blocked"
  | "needs_install"
  | "unconfigured"
  | "unsupported"
  | "error";

type PushConfiguration = {
  ok: boolean;
  configured: boolean;
  publicKey: string | null;
  activeSubscriptions: number;
};

function isIOS() {
  const userAgent = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function platform() {
  if (isIOS()) return "ios";
  if (/Android/i.test(window.navigator.userAgent)) return "android";
  return "desktop";
}

function applicationServerKey(publicKey: string) {
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}

function encodedApplicationServerKey(subscription: PushSubscription) {
  const key = subscription.options.applicationServerKey;
  if (!key) return "";
  const bytes = new Uint8Array(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function storeSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/notifications/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), platform: platform() }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "Notification subscription could not be saved.");
}

async function removeSubscription(subscription: PushSubscription) {
  await fetch("/api/notifications/push-subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}

export function WebPushControl() {
  const [state, setState] = useState<PushState>("loading");
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [detail, setDetail] = useState("Checking this device…");

  const inspect = useCallback(async () => {
    setState("loading");
    setDetail("Checking this device…");

    try {
      const response = await fetch("/api/notifications/push-subscription", { cache: "no-store" });
      const json = await response.json().catch(() => null) as PushConfiguration | null;
      if (!response.ok || !json?.ok) throw new Error("Notification settings could not be loaded.");
      setConfiguration(json);

      if (isIOS() && !isStandalone()) {
        setState("needs_install");
        setDetail("Add The BEE Suite to your Home Screen, open it there, then enable alerts.");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        setDetail("This browser does not support app notifications.");
        return;
      }
      if (!json.configured || !json.publicKey) {
        setState("unconfigured");
        setDetail("Device alerts aren’t available yet.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && encodedApplicationServerKey(subscription) !== json.publicKey) {
        await removeSubscription(subscription);
        setState("disabled");
        setDetail("Turn on alerts for notification-center delivery and an app icon badge.");
        return;
      }
      if (subscription) {
        if (json.activeSubscriptions === 0) await storeSubscription(subscription);
        setState("enabled");
        setDetail("Alerts and icon badges are enabled on this device.");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        setDetail("Notifications are blocked in this device's settings.");
        return;
      }

      setState("disabled");
      setDetail("Turn on alerts for notification-center delivery and an app icon badge.");
    } catch {
      setState("error");
      setDetail("Notification settings could not be checked. Try again.");
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void inspect(), 0);
    return () => window.clearTimeout(task);
  }, [inspect]);

  async function enable() {
    if (!configuration?.publicKey) return void inspect();
    setState("working");
    setDetail("Opening notification permission…");

    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "disabled");
        setDetail(permission === "denied"
          ? "Notifications are blocked in this device's settings."
          : "Notification permission was not enabled.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(configuration.publicKey),
      });
      await storeSubscription(subscription);
      setState("enabled");
      setDetail("Alerts and icon badges are enabled on this device.");
    } catch {
      setState("error");
      setDetail("Notifications could not be enabled. Try again from this installed app.");
    }
  }

  async function disable() {
    setState("working");
    setDetail("Turning off alerts on this device…");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await removeSubscription(subscription);
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge().catch(() => undefined);
      setState("disabled");
      setDetail("Alerts are off on this device.");
    } catch {
      setState("error");
      setDetail("Notifications could not be disabled. Try again.");
    }
  }

  const working = state === "loading" || state === "working";
  const actionable = ["enabled", "disabled", "error"].includes(state);
  const label = state === "enabled"
    ? "Turn Off Device Alerts"
    : state === "error"
      ? "Check Alerts Again"
      : state === "disabled"
        ? "Enable Device Alerts"
        : state === "needs_install"
          ? "Add to Home Screen"
          : state === "blocked"
            ? "Blocked in Device Settings"
            : state === "unconfigured"
              ? "Alerts Unavailable"
              : state === "unsupported"
                ? "Alerts Unavailable"
                : "Checking Alerts…";

  return (
    <div className="mt-3 rounded-lg border bg-background/60 p-3" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">Device alerts</div>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{detail}</p>
          <Button
            className="mt-2 h-8 w-full"
            size="sm"
            variant={state === "enabled" ? "outline" : "default"}
            disabled={working || !actionable}
            onClick={state === "enabled" ? disable : state === "error" ? inspect : enable}
            type="button"
          >
            {working ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}

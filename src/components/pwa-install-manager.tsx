"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DeviceKind = "ios" | "android" | "desktop";

const dismissedKey = "bee-suite-install-prompt-dismissed";

function readStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function readDeviceKind(): DeviceKind {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android|Silk|Kindle|KF[A-Z]+/.test(userAgent)) return "android";
  return "desktop";
}

function installCopy(deviceKind: DeviceKind, canPrompt: boolean) {
  if (canPrompt) {
    return {
      title: "Install The BEE Suite",
      body: "Add the app to this device so kiosk, parent, teacher, and admin workflows open like a local app.",
      button: "Install app",
      Icon: Download,
    };
  }

  if (deviceKind === "ios") {
    return {
      title: "Add to Home Screen",
      body: "On iPad or iPhone, open this page in Safari, tap Share, then choose Add to Home Screen.",
      button: "Got it",
      Icon: Share2,
    };
  }

  if (deviceKind === "android") {
    return {
      title: "Install on this tablet",
      body: "Use the browser menu in Chrome or Silk, then choose Install app or Add to Home screen.",
      button: "Got it",
      Icon: Download,
    };
  }

  return {
    title: "Install The BEE Suite",
    body: "Use your browser install icon or menu to keep The BEE Suite available from this device.",
    button: "Got it",
    Icon: Download,
  };
}

export function PwaInstallManager() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("desktop");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncBrowserState = window.setTimeout(() => {
      setDeviceKind(readDeviceKind());
      setIsStandalone(readStandaloneMode());
      setIsDismissed(window.localStorage.getItem(dismissedKey) === "1");
      setIsReady(true);
    }, 0);

    const media = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsStandalone(readStandaloneMode());
    media.addEventListener("change", handleDisplayModeChange);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.clearTimeout(syncBrowserState);
      media.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) {
      window.localStorage.setItem(dismissedKey, "1");
      setIsDismissed(true);
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
    setIsDismissed(true);
    window.localStorage.setItem(dismissedKey, "1");
  }

  function dismiss() {
    window.localStorage.setItem(dismissedKey, "1");
    setIsDismissed(true);
  }

  if (!isReady || pathname !== "/app" || isStandalone || isDismissed || (!installPrompt && deviceKind === "desktop")) return null;

  const copy = installCopy(deviceKind, Boolean(installPrompt));

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:bottom-5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-300 text-slate-950">
          <copy.Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{copy.title}</div>
          <p className="mt-1 text-sm leading-5 text-slate-300">{copy.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-8 px-3" onClick={handleInstall} type="button">
              {copy.button}
            </Button>
            <Button variant="outline" className="h-8 border-white/15 bg-transparent px-3 text-white hover:bg-white/10" onClick={dismiss} type="button">
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

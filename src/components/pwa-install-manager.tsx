"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, ListChecks, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DeviceKind = "ios" | "fire" | "android" | "desktop";

const dismissedKey = "bee-suite-install-prompt-dismissed:v1";

function readStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function readDeviceKind(): DeviceKind {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Silk|Kindle|KF[A-Z0-9]+|Fire/i.test(userAgent)) return "fire";
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
      button: "Show steps",
      Icon: Share2,
    };
  }

  if (deviceKind === "fire") {
    return {
      title: "Install on this Fire tablet",
      body: "Amazon Silk does not always open the install prompt from a page button. Use the tablet browser menu to add the app to the home screen.",
      button: "Show steps",
      Icon: ListChecks,
    };
  }

  if (deviceKind === "android") {
    return {
      title: "Install on this tablet",
      body: "Use the browser menu in Chrome or Silk, then choose Install app or Add to Home screen.",
      button: "Show steps",
      Icon: Download,
    };
  }

  return {
    title: "Install The BEE Suite",
    body: "Use your browser install icon or menu to keep The BEE Suite available from this device.",
    button: "Show steps",
    Icon: Download,
  };
}

function installSteps(deviceKind: DeviceKind) {
  if (deviceKind === "ios") {
    return ["Open this page in Safari.", "Tap Share.", "Choose Add to Home Screen.", "Confirm the BEE Suite icon."];
  }

  if (deviceKind === "fire") {
    return [
      "Open this page in the Silk browser.",
      "Tap the browser menu in the top right.",
      "Choose Add to Home screen or Install app.",
      "Confirm The BEE Suite, then open it from the tablet home screen.",
    ];
  }

  if (deviceKind === "android") {
    return ["Open this page in Chrome or Silk.", "Tap the browser menu.", "Choose Install app or Add to Home screen.", "Confirm The BEE Suite."];
  }

  return ["Open this page in Chrome or Edge.", "Use the browser install icon or menu.", "Confirm The BEE Suite.", "Open BEE Suite from your apps or dock."];
}

function readDismissed() {
  try {
    return window.localStorage.getItem(dismissedKey) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean) {
  try {
    if (value) {
      window.localStorage.setItem(dismissedKey, "1");
    } else {
      window.localStorage.removeItem(dismissedKey);
    }
  } catch {
    // Storage can be disabled on shared tablets; the banner still works without persistence.
  }
}

export function PwaInstallManager() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("desktop");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isPrompting, setIsPrompting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncBrowserState = window.setTimeout(() => {
      setDeviceKind(readDeviceKind());
      setIsStandalone(readStandaloneMode());
      setIsDismissed(readDismissed());
      setIsReady(true);
    }, 0);

    const media = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsStandalone(readStandaloneMode());
    media.addEventListener("change", handleDisplayModeChange);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
      setShowManualSteps(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.clearTimeout(syncBrowserState);
      media.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (showManualSteps) {
      dismiss();
      return;
    }

    if (!installPrompt) {
      setShowManualSteps(true);
      setIsDismissed(false);
      return;
    }

    try {
      setIsPrompting(true);
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice.catch(() => null);

      if (choice?.outcome === "accepted") {
        writeDismissed(true);
        setIsDismissed(true);
        return;
      }

      setShowManualSteps(true);
      setIsDismissed(false);
    } catch {
      setShowManualSteps(true);
      setIsDismissed(false);
    } finally {
      setInstallPrompt(null);
      setIsPrompting(false);
    }
  }

  function dismiss() {
    writeDismissed(true);
    setIsDismissed(true);
  }

  if (!isReady || pathname !== "/app" || isStandalone || isDismissed || (!installPrompt && deviceKind === "desktop")) return null;

  const copy = installCopy(deviceKind, Boolean(installPrompt));
  const steps = showManualSteps ? installSteps(deviceKind) : [];
  const primaryButtonLabel = showManualSteps ? "Done" : isPrompting ? "Opening..." : copy.button;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:bottom-5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-300 text-slate-950">
          <copy.Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{copy.title}</div>
          <p className="mt-1 text-sm leading-5 text-slate-300">{copy.body}</p>
          {showManualSteps ? (
            <ol className="mt-3 grid gap-1.5 text-sm leading-5 text-slate-200">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="text-amber-300">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-8 px-3" disabled={isPrompting} onClick={handleInstall} type="button">
              {primaryButtonLabel}
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

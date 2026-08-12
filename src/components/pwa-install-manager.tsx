"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, ListChecks, Share2, ShieldAlert, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { securePublicAppUrlForPath } from "@/lib/public-app-url";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DeviceKind = "ios" | "fire" | "android" | "desktop";

type InstallContext = {
  key: string;
  appName: string;
  body: string;
};

function installContextFromPathname(pathname: string): InstallContext | null {
  if (pathname === "/app") {
    return {
      key: "launcher",
      appName: "The BEE Suite",
      body: "Add The BEE Suite to this device for quick access from one icon.",
    };
  }
  if (pathname === "/parents" || pathname.startsWith("/parents/")) {
    return {
      key: "parents",
      appName: "BEE Suite Parent Portal",
      body: "Add the Parent Portal to this device for quick access to child updates, messages, documents, and payments.",
    };
  }
  if (pathname === "/teachers" || pathname.startsWith("/teachers/")) {
    return {
      key: "teachers",
      appName: "BEE Suite Teacher",
      body: "Add the teacher page to this classroom device for attendance, daily reports, messages, and photos.",
    };
  }
  if (pathname === "/directors" || pathname.startsWith("/directors/")) {
    return {
      key: "directors",
      appName: "BEE Suite Director",
      body: "Add the director page to this device for enrollment, billing, staff schedules, reports, and family support.",
    };
  }
  if (pathname === "/executives" || pathname.startsWith("/executives/")) {
    return {
      key: "executives",
      appName: "BEE Suite Executive",
      body: "Add the executive page to this device for location summaries, reports, and account settings.",
    };
  }
  return null;
}

function dismissedKey(context: InstallContext) {
  return `bee-suite-install-prompt-dismissed:${context.key}:v1`;
}

function readStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function readSecureInstallState() {
  const localDevelopmentHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";
  return {
    isSecureOrigin: window.location.protocol === "https:" || localDevelopmentHost,
    secureUrl: securePublicAppUrlForPath(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    ),
  };
}

function readDeviceKind(): DeviceKind {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Silk|Kindle|KF[A-Z0-9]+|Fire/i.test(userAgent)) return "fire";
  if (/Android|Silk|Kindle|KF[A-Z]+/.test(userAgent)) return "android";
  return "desktop";
}

function installCopy(deviceKind: DeviceKind, canPrompt: boolean, context: InstallContext) {
  if (canPrompt) {
    return {
      title: `Add ${context.appName} to this device`,
      body: context.body,
      button: "Add to device",
      Icon: Download,
    };
  }

  if (deviceKind === "ios") {
    return {
      title: "Add to Home Screen",
      body: `In Safari, tap Share, then choose Add to Home Screen for ${context.appName}.`,
      button: "View steps",
      Icon: Share2,
    };
  }

  if (deviceKind === "fire") {
    return {
      title: "Add to this Fire tablet",
      body: `In Silk, open the browser menu and choose Add to Home screen or Install app for ${context.appName}.`,
      button: "View steps",
      Icon: ListChecks,
    };
  }

  if (deviceKind === "android") {
    return {
      title: "Add to this Android device",
      body: `In Chrome or Silk, open the browser menu and choose Install app or Add to Home screen for ${context.appName}.`,
      button: "View steps",
      Icon: Download,
    };
  }

  return {
    title: `Add ${context.appName} to this computer`,
    body: `In Chrome or Edge, use the install icon or browser menu to add ${context.appName}.`,
    button: "View steps",
    Icon: Download,
  };
}

function installSteps(deviceKind: DeviceKind, context: InstallContext) {
  if (deviceKind === "ios") {
    return [
      "Open this page in Safari.",
      "Check that the address is thebeesuite.io.",
      "Tap Share.",
      "Choose Add to Home Screen.",
      `Tap Add to place the ${context.appName} icon on your Home Screen.`,
    ];
  }

  if (deviceKind === "fire") {
    return [
      "Open this page in the Silk browser.",
      "Tap the browser menu in the top right.",
      "Choose Add to Home screen or Install app.",
      `Confirm ${context.appName}, then open it from the tablet home screen.`,
    ];
  }

  if (deviceKind === "android") {
    return ["Open this page in Chrome or Silk.", "Tap the browser menu.", "Choose Install app or Add to Home screen.", `Confirm ${context.appName}.`];
  }

  return ["Open this page in Chrome or Edge.", "Use the browser install icon or menu.", `Confirm ${context.appName}.`, `Open ${context.appName} from your apps or dock.`];
}

function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string, value: boolean) {
  try {
    if (value) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be disabled on shared tablets; the banner still works without persistence.
  }
}

export function PwaInstallManager() {
  const pathname = usePathname();
  const installContext = installContextFromPathname(pathname);
  const storageKey = installContext ? dismissedKey(installContext) : "";
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("desktop");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isSecureOrigin, setIsSecureOrigin] = useState(true);
  const [secureUrl, setSecureUrl] = useState("https://thebeesuite.io/parents");
  const [isDismissed, setIsDismissed] = useState(true);
  const [isPrompting, setIsPrompting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    const reloadKey = "bee-suite-pwa-controllerchange-reload";

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        registration.update().catch(() => undefined);
      })
      .catch(() => undefined);

    const handleControllerChange = () => {
      try {
        const alreadyReloaded = sessionStorage.getItem(reloadKey);
        if (alreadyReloaded === "1") return;
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      } catch {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  useEffect(() => {
    const syncBrowserState = window.setTimeout(() => {
      const secureInstallState = readSecureInstallState();
      setDeviceKind(readDeviceKind());
      setIsStandalone(readStandaloneMode());
      setIsSecureOrigin(secureInstallState.isSecureOrigin);
      setSecureUrl(secureInstallState.secureUrl);
      setIsDismissed(storageKey ? readDismissed(storageKey) : true);
      setIsReady(true);
      if (!secureInstallState.isSecureOrigin) {
        window.location.replace(secureInstallState.secureUrl);
      }
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
  }, [storageKey]);

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
        writeDismissed(storageKey, true);
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
    writeDismissed(storageKey, true);
    setIsDismissed(true);
  }

  if (!isReady || !installContext || isStandalone) return null;

  if (!isSecureOrigin) {
    return (
      <div
        className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/90 p-4 text-white backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="insecure-install-title"
      >
        <div className="flex w-full max-w-lg items-start gap-3 rounded-xl border border-red-300/35 bg-slate-950 p-4 shadow-2xl shadow-black/50 sm:p-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-300 text-red-950">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div id="insecure-install-title" className="text-sm font-semibold">Do not install from this page</div>
            <p className="mt-1 text-sm leading-5 text-slate-300">
              This connection is not secure. Do not enter a password or add this page to your iPhone Home Screen.
              Open the official secure BEE Suite address below instead.
            </p>
            <a href={secureUrl} className={buttonVariants({ className: "mt-3 min-h-11 px-3" })}>
              Open secure BEE Suite
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isDismissed || (!installPrompt && deviceKind === "desktop")) return null;

  const copy = installCopy(deviceKind, Boolean(installPrompt), installContext);
  const steps = showManualSteps ? installSteps(deviceKind, installContext) : [];
  const primaryButtonLabel = showManualSteps ? "Done" : isPrompting ? "Adding…" : copy.button;

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
            <Button className="min-h-11 px-3" disabled={isPrompting} onClick={handleInstall} type="button">
              {primaryButtonLabel}
            </Button>
            <Button variant="outline" className="min-h-11 border-white/15 bg-transparent px-3 text-white hover:bg-white/10" onClick={dismiss} type="button">
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

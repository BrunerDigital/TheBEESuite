import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { PwaInstallManager } from "@/components/pwa-install-manager";
import { SubmissionFeedback } from "@/components/submission-feedback";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CANONICAL_APP_BASE_URL } from "@/lib/public-app-url";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./product-ui.css";

const browserIcon = "/brand/the-bee-suite/browser-icon.png";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_APP_BASE_URL),
  title: "The BEE Suite",
  applicationName: "The BEE Suite",
  description:
    "Childcare operations software for enrollment, billing, classrooms, family communication, and multi-location management.",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    shortcut: [{ url: browserIcon, sizes: "512x512", type: "image/png" }],
    icon: [{ url: browserIcon, sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/brand/the-bee-suite/app-icon-yellow.png", sizes: "1024x1024", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BEE Suite",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5b51b" },
    { media: "(prefers-color-scheme: dark)", color: "#05070a" },
  ],
};

const themeBootstrap = `
try {
  const stored = window.localStorage.getItem("bee-suite-theme");
  const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
} catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const collectVercelTelemetry = process.env.NODE_ENV === "production";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <ClientErrorReporter />
        <PwaInstallManager />
        <SubmissionFeedback />
        {collectVercelTelemetry ? <Analytics /> : null}
        {collectVercelTelemetry ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}

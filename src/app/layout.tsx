import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaInstallManager } from "@/components/pwa-install-manager";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The BEE Suite",
  applicationName: "The BEE Suite",
  description:
    "White-label childcare CRM, enrollment, billing, classroom operations, and parent engagement command center.",
  manifest: "/manifest.webmanifest",
  icons: {
    shortcut: [{ url: "/favicon.ico" }],
    icon: [{ url: "/brand/the-bee-suite/favicon.png", sizes: "512x512", type: "image/png" }],
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
  colorScheme: "dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5b51b" },
    { media: "(prefers-color-scheme: dark)", color: "#05070a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <PwaInstallManager />
        <Analytics />
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";
import { storeApps } from "@/lib/app-store-apps";

const appIcon = "/brand/the-bee-suite/app-icon-yellow.png";
const { parent, teacher, director, executive } = storeApps;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "The BEE Suite",
    short_name: "BEE Suite",
    description: "Installable childcare operations app for school kiosks, parents, teachers, and leaders.",
    start_url: "/app",
    scope: "/",
    lang: "en-US",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: "#05070a",
    theme_color: "#f5b51b",
    categories: ["business", "education", "productivity"],
    launch_handler: {
      client_mode: "focus-existing",
    },
    icons: [
      {
        src: appIcon,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appIcon,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/the-bee-suite/favicon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Kiosk",
        short_name: "Kiosk",
        description: "Open the school kiosk launcher for family check-in/out and staff clock-in/out.",
        url: "/check-in",
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
      {
        name: "Parent Portal",
        short_name: "Parents",
        description: parent.description,
        url: parent.loginPath,
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
      {
        name: "Teacher Portal",
        short_name: "Teachers",
        description: teacher.description,
        url: teacher.loginPath,
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
      {
        name: "Director Portal",
        short_name: "Directors",
        description: director.description,
        url: director.loginPath,
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
      {
        name: "Executive Portal",
        short_name: "Executives",
        description: executive.description,
        url: executive.loginPath,
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
    ],
  };
}

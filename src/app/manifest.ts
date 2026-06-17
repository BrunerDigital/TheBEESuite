import type { MetadataRoute } from "next";

const appIcon = "/brand/the-bee-suite/app-icon-yellow.png";

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
        description: "Open family dashboard, photos, messages, documents, and tuition.",
        url: "/parent-portal",
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
      {
        name: "Teacher Portal",
        short_name: "Teachers",
        description: "Open classroom attendance, reports, notes, photos, and messages.",
        url: "/teacher-portal",
        icons: [{ src: appIcon, sizes: "1024x1024", type: "image/png" }],
      },
    ],
  };
}

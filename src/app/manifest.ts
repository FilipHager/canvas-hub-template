import type { MetadataRoute } from "next";

// PWA-manifest: gör att appen kan installeras på hemskärmen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Canvas Hub",
    short_name: "Canvas Hub",
    description: "Personlig översikt ovanpå KTH Canvas",
    start_url: "/paminnelser",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1954a6",
    lang: "sv",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reality MVP",
    short_name: "Reality MVP",
    description: "Turn a product sketch and prompt into a runnable spatial prototype.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#2563EB",
    icons: [
      {
        src: "/window.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
    ],
  };
}

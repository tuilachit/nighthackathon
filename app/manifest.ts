import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_PITCH } from "@/lib/site-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: PRODUCT_PITCH,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#17221f",
    icons: [
      {
        src: "/icons/fitment-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/fitment-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}

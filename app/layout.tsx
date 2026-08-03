import type { Metadata } from "next";
import {
  PRODUCT_NAME,
  PRODUCT_PITCH,
  PRODUCTION_URL,
} from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_URL),
  applicationName: PRODUCT_NAME,
  title: {
    default: `${PRODUCT_NAME} — Furniture that fits`,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: PRODUCT_PITCH,
  openGraph: {
    type: "website",
    url: PRODUCTION_URL,
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} — Furniture that fits`,
    description: PRODUCT_PITCH,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — Furniture that fits`,
    description: PRODUCT_PITCH,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/fitment-192.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}

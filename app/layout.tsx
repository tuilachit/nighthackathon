import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Fit First",
  title: "Fit First",
  description: "Furniture that fits your measured space and access opening.",
  appleWebApp: {
    capable: true,
    title: "Fit First",
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

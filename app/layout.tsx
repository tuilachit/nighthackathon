import type { Metadata } from "next";
import { ProjectNavigation } from "./ProjectNavigation";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Reality MVP",
  title: "Reality MVP",
  description: "Mobile-first spatial prototype builder for product concepts.",
  appleWebApp: {
    capable: true,
    title: "Reality MVP",
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
        <ProjectNavigation />
        {children}
      </body>
    </html>
  );
}

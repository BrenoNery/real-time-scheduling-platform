import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Real-Time Scheduling Platform",
  description: "Scheduling platform with SSR and concurrency-safe booking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

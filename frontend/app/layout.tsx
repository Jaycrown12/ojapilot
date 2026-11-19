import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OJAPILOT - AI Business & Inventory Copilot",
  description: "AI-first business and inventory copilot for SMEs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}

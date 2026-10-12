import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { pixelify, pressStart } from "./fonts";

export const metadata: Metadata = {
  title: "Packet Clash — a networks creature-battler",
  description: "Catch, train and battle packet creatures while you learn computer networks, from the OSI model and subnetting to TCP, DNS, TLS and interview questions.",
  // iPhone "Add to Home Screen": open full-screen like an app
  appleWebApp: { capable: true, title: "Packet Clash", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#141029",
  // let fixed bottom bars sit above the iPhone home indicator (safe-area insets)
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pixelify.variable} ${pressStart.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

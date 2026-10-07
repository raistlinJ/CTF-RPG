// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import type { Metadata } from "next";
import AppFooter from "@/components/app-footer";
import "./globals.css";
export const metadata: Metadata = {
  title: "CTF-RPG",
  description:
    "A reusable capture-the-flag RPG for classroom challenges and team learning.",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="ctf-app-shell">
        {children}
        <AppFooter />
      </body>
    </html>
  );
}

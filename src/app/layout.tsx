import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STOZ Administratie - Hybride Begrip",
  description: "Projectadministratie voor het STOZ-project Hybride Begrip - Fysiotherapie Fy-fit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

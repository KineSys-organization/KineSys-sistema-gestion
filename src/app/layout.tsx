import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KineSys — Sistema de gestión",
  description: "Sistema de gestión del centro médico y de kinesiología",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "@/styles/game.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mattie Run",
  description: "A WebGL maze game — pilot your ship, collect puzzle pieces, and escape.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="screen-orientation" content="landscape" />
      </head>
      <body>{children}</body>
    </html>
  );
}

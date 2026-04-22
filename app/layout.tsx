import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const frankHebrew = Frank_Ruhl_Libre({
  variable: "--font-hebrew",
  subsets: ["hebrew", "latin", "latin-ext"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hebrew word match",
  description:
    "Practice Hebrew reading with nikud: pick the English transliteration for each vowelized word across 20 levels.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${frankHebrew.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col font-sans">{children}</body>
    </html>
  );
}

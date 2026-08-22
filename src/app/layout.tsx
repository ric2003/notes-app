import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  applicationName: "Live Notes",
  title: {
    default: "Live Notes",
    template: "%s | Live Notes",
  },
  description: "Interactive, real-time notes canvas with zoom and pan.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: "Live Notes",
    siteName: "Live Notes",
    description: "Interactive, real-time notes canvas with zoom and pan.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          minHeight: "100dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
          overscrollBehaviorY: "contain",
        }}
      >
        {children}
      </body>
    </html>
  );
}

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
  metadataBase: new URL(siteUrl),
  title: {
    default: "Live Notes",
    template: "%s | Live Notes",
  },
  description: "Interactive, real-time notes canvas with zoom and pan.",
  keywords: [
    "live notes",
    "sticky notes",
    "collaborative notes",
    "real-time",
    "whiteboard",
    "notes canvas",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Live Notes",
    siteName: "Live Notes",
    description: "Interactive, real-time notes canvas with zoom and pan.",
    images: [
      {
        url: "/favicon.ico",
        width: 1200,
        height: 630,
        alt: "Live Notes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Notes",
    description: "Interactive, real-time notes canvas with zoom and pan.",
    images: ["/favicon.ico"],
  },
  icons: {
    icon: "/favicon.ico",
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
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

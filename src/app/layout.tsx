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
const resolvedSiteUrl = siteUrl;
const verification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
  ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
  : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(resolvedSiteUrl),
  applicationName: "Live Notes",
  authors: [{ name: "Live Notes" }],
  creator: "Live Notes",
  publisher: "Live Notes",
  category: "Productivity",
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
    "shared notes",
    "online whiteboard",
    "drag and drop",
    "zoom and pan",
    "productivity",
    "brainstorming",
    "Next.js",
    "Netlify",
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
    url: resolvedSiteUrl,
    title: "Live Notes",
    siteName: "Live Notes",
    description: "Interactive, real-time notes canvas with zoom and pan.",
    images: [
      {
        url: `${resolvedSiteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Live Notes",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Notes",
    description: "Interactive, real-time notes canvas with zoom and pan.",
    images: [`${resolvedSiteUrl}/twitter-image`],
  },
  icons: {
    icon: "/favicon.ico",
  },
  verification,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Live Notes",
              url: resolvedSiteUrl,
              description:
                "Interactive, real-time notes canvas with zoom and pan.",
              inLanguage: "en",
              potentialAction: {
                "@type": "SearchAction",
                target: `${resolvedSiteUrl}/?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Live Notes",
              applicationCategory: "Productivity",
              operatingSystem: "All",
              url: resolvedSiteUrl,
              image: `${resolvedSiteUrl}/opengraph-image`,
              offers: {
                "@type": "Offer",
                price: 0,
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
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

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const config: MetadataRoute.Robots = {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [],
    },
  };

  if (baseUrl) {
    config.sitemap = `${baseUrl}/sitemap.xml`;
    config.host = baseUrl;
  }

  return config;
}

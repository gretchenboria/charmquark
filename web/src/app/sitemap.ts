import type { MetadataRoute } from "next";

/** One public URL today. Add entries here as public pages are added. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: "https://charmquark.app",
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  }];
}

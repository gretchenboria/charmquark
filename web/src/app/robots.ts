import type { MetadataRoute } from "next";

/**
 * Only the public surface is crawlable — everything else sits behind Cloudflare
 * Access and would serve a login redirect to a crawler anyway. Disallowing it
 * explicitly keeps those redirects out of the index rather than leaving a bot to
 * discover it the slow way.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/llms.txt"],
      disallow: [
        "/api/", "/home", "/coverage", "/schedule", "/auto-schedule", "/monitoring",
        "/reports", "/campaigns", "/missions", "/catalog-sync", "/inventory",
        "/robots/", "/operators", "/labs", "/sensors", "/runs", "/users", "/workflows",
      ],
    }],
    sitemap: "https://charmquark.app/sitemap.xml",
    host: "https://charmquark.app",
  };
}

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default adapter config. The app is client-data-driven (every list and detail
// page fetches from the Worker API at runtime), so it needs no incremental
// cache. Add `incrementalCache` here if ISR is introduced later.
export default defineCloudflareConfig();

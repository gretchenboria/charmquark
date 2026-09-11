/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // packages/contracts lives outside web/ and is shared with the API Worker.
  experimental: { externalDir: true },

  async rewrites() {
    // DEV ONLY. `next dev` proxies /api/* to the Worker API running on :8787.
    //
    // In production the rewrite is deliberately absent: charmquark.app/api/* is
    // bound directly to the charmquark-api Worker at the edge (see api/wrangler.jsonc
    // `routes`), so API calls never transit the web Worker at all — one less hop,
    // and no shared-secret plumbing between the two Workers.
    //
    // It is also not merely unnecessary in production but actively unsafe: the
    // OpenNext adapter parses rewrite destinations with path-to-regexp, which reads
    // the ":8787" in a host:port destination as a named parameter and throws.
    if (process.env.NODE_ENV !== "development") return [];

    const backend = process.env.API_URL || "http://127.0.0.1:8787";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;

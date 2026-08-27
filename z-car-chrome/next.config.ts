import type { NextConfig } from "next";

// STATIC_EXPORT=1 produces a plain HTML/JS/CSS site in `out/` for static
// hosting (e.g. shared rental servers). The default build stays targeted at
// Cloudflare Workers via vinext.
const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT === "1"
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        // The Cloudflare-only modules (cloudflare:workers) are unresolvable
        // outside the Workers toolchain; they are unused by the exported page.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;

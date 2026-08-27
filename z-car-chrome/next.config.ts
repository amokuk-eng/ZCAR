import type { NextConfig } from "next";

// STATIC_EXPORT=1 produces a plain HTML/JS/CSS site in `out/` for static
// hosting (e.g. shared rental servers). The default build stays targeted at
// Cloudflare Workers via vinext. BASE_PATH (e.g. "/zcar") must match the
// subdirectory the site is served from; it is also exposed to client code
// as NEXT_PUBLIC_BASE_PATH for hardcoded public-asset references.
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = staticExport ? (process.env.BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  ...(staticExport
    ? {
        output: "export" as const,
        ...(basePath ? { basePath } : {}),
        images: { unoptimized: true },
        // The Cloudflare-only modules (cloudflare:workers) are unresolvable
        // outside the Workers toolchain; they are unused by the exported page.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;

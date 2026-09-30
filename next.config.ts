import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` output is for self-hosted deploys (bun .next/standalone/server.js).
  // It must stay disabled on Vercel: Vercel traces/packages its own output, and
  // with Next 16 + Turbopack enabling it breaks the build during onBuildComplete
  // with `ENOENT .next/next-server.js.nft.json`.
  output: process.env.VERCEL ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Phase 88 — increase body size limit for file uploads (game zips, explore
  // projects, course outlines, AI tutor images). Vercel's default is 4.5MB
  // which causes 413 errors on larger files.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Phase 25 — extend API route timeout to 60s for AI calls
  // (default is 10s on Vercel Hobby plan which causes 504s)
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "x-vercel-function-max-duration", value: "60" },
        ],
      },
    ];
  },
};

export default nextConfig;

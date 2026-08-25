import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
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

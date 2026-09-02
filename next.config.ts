import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  // Compress responses
  compress: true,
  // Power by header off (tiny perf win)
  poweredByHeader: false,
};

export default nextConfig;

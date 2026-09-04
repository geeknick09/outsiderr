import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseHost = "supabase.co";
try {
  if (supabaseUrl) supabaseHost = new URL(supabaseUrl).hostname;
} catch {
  // keep default
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (project-specific + generic CDN)
      { protocol: "https", hostname: supabaseHost },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      // Common image CDNs (organizers may paste URLs)
      { protocol: "https", hostname: "**.imgur.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.instagram.com" },
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

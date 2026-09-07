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
  // Tree-shake barrel imports from lucide-react (only bundle used icons)
  // + serverActions.allowedOrigins for CSRF origin matching.
  // Without allowedOrigins, Next.js throws "Invalid Server Actions request."
  // when the origin header doesn't match x-forwarded-host (e.g. Vercel preview
  // deployments, custom domains, or dev preview proxies).
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: {
      allowedOrigins: [
        // Production + preview deployments on Vercel
        "outsiderr.vercel.app",
        "*.vercel.app",
        // Custom production domain
        "outsiderr.in",
        "*.outsiderr.in",
        // Local dev server
        "localhost:3000",
        "localhost:3001",
      ],
    },
    // Router Cache: reduce client-side RSC payload cache lifetime.
    // Default is 30s for dynamic pages, 5min for static. After a Server Action
    // mutates data (e.g. creating an event), revalidatePath invalidates the
    // server-side cache but NOT the client-side Router Cache. Users navigating
    // back to the same page see stale data until the cache expires.
    // Setting dynamic staleTime to 0 forces a fresh fetch on every navigation.
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
  },
  // Allow /_next/* internal dev resources from the preview proxy
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

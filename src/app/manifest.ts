import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Outsiderr — Underground events, discovered",
    short_name: "Outsiderr",
    description:
      "Cyphers, block parties, battles, stunts, skates, meetups, jams & real communities. Discover raw underground events happening today near you.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0A0A0E",
    theme_color: "#0A0A0E",
    categories: ["events", "entertainment", "lifestyle"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/lightmode.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/darkmode.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Discover events",
        short_name: "Discover",
        url: "/?source=pwa",
        description: "Browse underground events near you",
      },
      {
        name: "My tickets",
        short_name: "Tickets",
        url: "/tickets?source=pwa",
        description: "View your confirmed QR passes",
      },
      {
        name: "Organize",
        short_name: "Organize",
        url: "/organizer?source=pwa",
        description: "Create and manage events",
      },
    ],
  };
}

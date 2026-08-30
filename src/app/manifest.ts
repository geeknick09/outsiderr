import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Outsiderr — Underground events, discovered",
    short_name: "Outsiderr",
    description:
      "Cyphers, block parties, battles, stunts, skates, meetups, jams & real communities. Discover raw underground events happening today near you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0E",
    theme_color: "#0A0A0E",
    categories: ["events", "entertainment", "lifestyle"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Discover events",
        short_name: "Discover",
        url: "/",
        description: "Browse underground events near you",
      },
      {
        name: "My tickets",
        short_name: "Tickets",
        url: "/tickets",
        description: "View your confirmed QR passes",
      },
      {
        name: "Organize",
        short_name: "Organize",
        url: "/organizer",
        description: "Create and manage events",
      },
    ],
  };
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const startTime = Date.now();

/**
 * Health check endpoint.
 *
 * Returns the current server status and uptime. No authentication required.
 * Useful for uptime monitoring and load balancer health checks.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
}

import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * Serves the OpenAPI 3.0.3 specification for all Outsiderr HTTP API routes.
 * Used by the Swagger UI at /api-docs.
 */
export async function GET() {
  return NextResponse.json(spec);
}

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Outsiderr API",
    description:
      "HTTP API for the Outsiderr culture and events platform.\n\n" +
      "## Authentication\n\n" +
      "- **Razorpay Webhook**: HMAC-SHA256 signature via `x-razorpay-signature` header\n" +
      "- **Cron Endpoint**: Bearer token via `Authorization: Bearer <CRON_SECRET>` header\n\n" +
      "## Financial Model\n\n" +
      "All money is stored in **paise** (1 rupee = 100 paise) as integers.\n\n" +
      "| Field | Formula |\n" +
      "|-------|----------|\n" +
      "| subtotal | unit_price × quantity |\n" +
      "| commission | subtotal × commission_bps / 10000 |\n" +
      "| convenience_fee | subtotal × convenience_fee_bps / 10000 |\n" +
      "| platform_fee | commission + convenience_fee |\n" +
      "| total (buyer pays) | subtotal + convenience_fee |\n" +
      "| organizer_payout | subtotal - commission |",
    version: "1.0.0",
    contact: {
      name: "Outsiderr",
      url: "https://outsiderr.com",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development",
    },
    {
      url: "https://outsiderr.com",
      description: "Production",
    },
  ],
  tags: [
    {
      name: "Webhooks",
      description: "Third-party webhook receivers (Razorpay)",
    },
    {
      name: "Cron",
      description: "Scheduled job endpoints",
    },
    {
      name: "Health",
      description: "Health and status checks",
    },
  ],
  paths: {
    // ─── Razorpay Webhook ───────────────────────────────────────────
    "/api/razorpay/webhook": {
      post: {
        tags: ["Webhooks"],
        summary: "Razorpay webhook receiver",
        description:
          "Handles Razorpay payment lifecycle events. Verifies HMAC-SHA256 signature " +
          "using `RAZORPAY_WEBHOOK_SECRET`, then processes the event idempotently.\n\n" +
          "**Handled events:**\n" +
          "- `payment.captured` / `order.paid` → confirms order, mints tickets, inserts payment_ledger\n" +
          "- `payment.failed` → marks order as FAILED\n" +
          "- `refund.processed` → updates refund status to COMPLETED, inserts refund ledger entry\n" +
          "- `refund.failed` → updates refund status to FAILED\n\n" +
          "**Idempotency:** The `webhook_events` table keyed on `razorpay_event_id` prevents " +
          "duplicate processing. Duplicate events return `already_processed`.\n\n" +
          "**Note:** Always returns 200 after signature verification to prevent Razorpay retries. " +
          "Failed processing is tracked via `processed=false` in `webhook_events` for admin monitoring.",
        operationId: "razorpayWebhook",
        security: [{ RazorpaySignature: [] }],
        requestBody: {
          required: true,
          description:
            "Raw JSON body from Razorpay. The body is read as text for HMAC signature " +
            "verification before JSON parsing.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RazorpayWebhookPayload" },
              examples: {
                paymentCaptured: {
                  summary: "Payment Captured",
                  value: {
                    entity: "event",
                    event: {
                      id: "evt_001abc",
                      entity: "event",
                      account_id: "acc_123",
                      created_at: 1693500000,
                    },
                    payload: {
                      payment: {
                        entity: {
                          id: "pay_001abc",
                          order_id: "order_001abc",
                          method: "upi",
                          amount: 459000,
                          currency: "INR",
                          status: "captured",
                        },
                      },
                    },
                  },
                },
                paymentFailed: {
                  summary: "Payment Failed",
                  value: {
                    entity: "event",
                    event: {
                      id: "evt_002def",
                      entity: "event",
                      created_at: 1693500100,
                    },
                    payload: {
                      payment: {
                        entity: {
                          id: "pay_002def",
                          order_id: "order_002def",
                          method: "card",
                          amount: 459000,
                          currency: "INR",
                          status: "failed",
                        },
                      },
                    },
                  },
                },
                refundProcessed: {
                  summary: "Refund Processed",
                  value: {
                    entity: "event",
                    event: {
                      id: "evt_003ghi",
                      entity: "event",
                      created_at: 1693500200,
                    },
                    payload: {
                      refund: {
                        entity: {
                          id: "rfd_001abc",
                          payment_id: "pay_001abc",
                          amount: 459000,
                          status: "processed",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook received and processed (or already processed)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebhookResponse" },
                examples: {
                  processed: {
                    summary: "Successfully processed",
                    value: { status: "processed" },
                  },
                  alreadyProcessed: {
                    summary: "Duplicate event (idempotency)",
                    value: { status: "already_processed" },
                  },
                  failed: {
                    summary: "Processing failed (still returns 200)",
                    value: { status: "failed", error: "Missing order id or payment entity" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Signature verification failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Invalid signature" },
              },
            },
          },
          "400": {
            description: "Invalid request body or missing fields",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  invalidJson: { value: { error: "Invalid JSON" } },
                  missingEventId: { value: { error: "Missing event id" } },
                },
              },
            },
          },
          "500": {
            description: "Server configuration error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Webhook not configured" },
              },
            },
          },
        },
      },
    },

    // ─── Cron: Expire Reservations ──────────────────────────────────
    "/api/cron/expire-reservations": {
      get: {
        tags: ["Cron"],
        summary: "Expire stale reserved orders",
        description:
          "Cron endpoint that expires stale `RESERVED` orders whose 15-minute " +
          "reservation window has elapsed. Releases reserved inventory back to " +
          "the tier pool.\n\n" +
          "**Schedule:** Every 1 minute (Vercel Cron or external scheduler).\n\n" +
          "**Security:** Verifies `CRON_SECRET` via Bearer token using timing-safe " +
          "comparison to prevent timing attacks.",
        operationId: "expireReservations",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Cron job executed successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CronResponse" },
                example: {
                  status: "ok",
                  expired_orders: 3,
                  timestamp: "2026-09-07T12:00:00.000Z",
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid CRON_SECRET",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Unauthorized" },
              },
            },
          },
          "500": {
            description: "Server configuration error or internal failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  notConfigured: { value: { error: "Cron not configured" } },
                  internalError: {
                    value: { status: "error", error: "Database connection failed" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Health Check ────────────────────────────────────────────────
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Returns the current server status and timestamp. Useful for uptime " +
          "monitoring and load balancer health checks. No authentication required.",
        operationId: "healthCheck",
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  timestamp: "2026-09-07T12:00:00.000Z",
                  uptime: 3600,
                },
              },
            },
          },
        },
      },
    },
  },

  // ─── Components ───────────────────────────────────────────────────
  components: {
    securitySchemes: {
      RazorpaySignature: {
        type: "apiKey",
        in: "header",
        name: "x-razorpay-signature",
        description:
          "HMAC-SHA256 signature of the raw request body, computed using " +
          "RAZORPAY_WEBHOOK_SECRET. Set by Razorpay automatically.",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Bearer token using CRON_SECRET value.",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "Human-readable error message",
          },
        },
        required: ["error"],
      },

      WebhookResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["processed", "already_processed", "failed"],
            description: "Processing outcome",
          },
          error: {
            type: "string",
            nullable: true,
            description: "Error message if status is 'failed'",
          },
        },
        required: ["status"],
      },

      CronResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["ok", "error"],
          },
          expired_orders: {
            type: "integer",
            description: "Number of stale reserved orders that were expired",
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          error: {
            type: "string",
            nullable: true,
            description: "Error message if status is 'error'",
          },
        },
        required: ["status"],
      },

      HealthResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["ok"],
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          uptime: {
            type: "integer",
            description: "Server uptime in seconds",
          },
        },
        required: ["status", "timestamp"],
      },

      RazorpayWebhookPayload: {
        type: "object",
        description: "Razorpay webhook payload (subset of full schema)",
        properties: {
          entity: {
            type: "string",
            example: "event",
          },
          event: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique Razorpay event ID (used for idempotency)",
                example: "evt_001abc",
              },
              entity: {
                type: "string",
                example: "event",
              },
              account_id: {
                type: "string",
              },
              created_at: {
                type: "integer",
                description: "Unix timestamp",
              },
            },
            required: ["id", "entity"],
          },
          payload: {
            type: "object",
            properties: {
              payment: {
                type: "object",
                properties: {
                  entity: {
                    $ref: "#/components/schemas/RazorpayPayment",
                  },
                },
              },
              order: {
                type: "object",
                properties: {
                  entity: {
                    $ref: "#/components/schemas/RazorpayOrder",
                  },
                },
              },
              refund: {
                type: "object",
                properties: {
                  entity: {
                    $ref: "#/components/schemas/RazorpayRefund",
                  },
                },
              },
            },
          },
        },
      },

      RazorpayPayment: {
        type: "object",
        properties: {
          id: { type: "string", example: "pay_001abc" },
          order_id: { type: "string", example: "order_001abc" },
          method: {
            type: "string",
            enum: ["upi", "card", "netbanking", "wallet", "emi", "paylater"],
          },
          amount: {
            type: "integer",
            description: "Amount in paise",
            example: 459000,
          },
          currency: { type: "string", example: "INR" },
          status: {
            type: "string",
            enum: ["created", "authorized", "captured", "refunded", "failed"],
          },
        },
        required: ["id"],
      },

      RazorpayOrder: {
        type: "object",
        properties: {
          id: { type: "string", example: "order_001abc" },
          amount_paid: { type: "integer", description: "Amount in paise" },
          amount_due: { type: "integer", description: "Amount in paise" },
          status: {
            type: "string",
            enum: ["created", "attempted", "paid"],
          },
        },
        required: ["id"],
      },

      RazorpayRefund: {
        type: "object",
        properties: {
          id: { type: "string", example: "rfd_001abc" },
          payment_id: { type: "string", example: "pay_001abc" },
          amount: {
            type: "integer",
            description: "Refund amount in paise",
            example: 459000,
          },
          status: {
            type: "string",
            enum: ["pending", "processed", "failed"],
          },
        },
        required: ["id"],
      },
    },
  },
};

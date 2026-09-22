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
      "- **Cron Endpoint**: Bearer token via `Authorization: Bearer <CRON_SECRET>` header\n" +
      "- **API v1 (mobile/clients)**: `Authorization: Bearer <supabase-access-token>` — " +
      "obtained via Supabase Auth sign-in. PIN-auth routes (scanner/box-office) take the " +
      "PIN in the JSON body instead.\n\n" +
      "## API v1 Response Envelope\n\n" +
      "All `/api/v1/*` routes return `{ ok: true, data }` on success and " +
      "`{ ok: false, error }` on failure. HTTP status codes: 400 validation/business " +
      "errors, 401 unauthenticated/invalid PIN, 429 rate-limited.\n\n" +
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
    {
      name: "API v1",
      description: "Mobile/client REST API — Bearer JWT (Supabase) or PIN auth",
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

    // ─── API v1: mobile/client REST surface ──────────────────────────
    // Auth: Bearer <supabase-access-token> unless noted. Envelope:
    // { ok: true, data } | { ok: false, error }.
    "/api/v1/me": {
      get: {
        tags: ["API v1"],
        summary: "Current user (auth sanity check)",
        operationId: "v1Me",
        security: [{ SupabaseAuth: [] }],
        responses: {
          "200": { description: "Authenticated user", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/checkout": {
      post: {
        tags: ["API v1"],
        summary: "Reserve inventory + create Razorpay order",
        description: "Returns a CheckoutSession — feed `razorpayOrderId`/`keyId`/`amountPaise` to the Razorpay native SDK, then call /api/v1/payments/verify.",
        operationId: "v1Checkout",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["eventId", "tierId", "quantity"],
          properties: {
            eventId: { type: "string", format: "uuid" },
            tierId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, maximum: 50 },
            buyerName: { type: "string" }, buyerPhone: { type: "string" },
            buyerEmail: { type: "string", format: "email" }, buyerGender: { type: "string" },
          },
        } } } },
        responses: {
          "200": { description: "CheckoutSession", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" }, example: { ok: true, data: { session: { orderId: "uuid", razorpayOrderId: "order_x", amountPaise: 459000, currency: "INR", keyId: "rzp_...", eventTitle: "Event", tierName: "GA", quantity: 1 } } } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/payments/verify": {
      post: {
        tags: ["API v1"],
        summary: "Verify Razorpay signature + confirm order (idempotent)",
        operationId: "v1VerifyPayment",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["razorpayOrderId", "razorpayPaymentId", "razorpaySignature"],
          properties: {
            razorpayOrderId: { type: "string" }, razorpayPaymentId: { type: "string" },
            razorpaySignature: { type: "string" }, paymentMethod: { type: "string" },
          },
        } } } },
        responses: {
          "200": { description: "Order confirmed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/payments/failure": {
      post: {
        tags: ["API v1"],
        summary: "Release a RESERVED order's inventory on payment failure/abandon",
        operationId: "v1PaymentFailure",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["razorpayOrderId"], properties: { razorpayOrderId: { type: "string" } },
        } } } },
        responses: {
          "200": { description: "Reservation released", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/orders/manual": {
      post: {
        tags: ["API v1"],
        summary: "Free RSVP or manual-UPI order (PENDING_VERIFICATION)",
        operationId: "v1ManualOrder",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["eventId", "tierId", "quantity"],
          properties: {
            eventId: { type: "string", format: "uuid" }, tierId: { type: "string", format: "uuid" },
            quantity: { type: "integer" }, isFree: { type: "boolean" },
            buyerName: { type: "string" }, buyerPhone: { type: "string" },
            buyerEmail: { type: "string" }, buyerGender: { type: "string" },
            utrReference: { type: "string" },
          },
        } } } },
        responses: {
          "200": { description: "Order submitted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/refunds/postponement": {
      post: {
        tags: ["API v1"],
        summary: "Request refund for a postponed event",
        operationId: "v1PostponementRefund",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["eventId"], properties: { eventId: { type: "string", format: "uuid" } },
        } } } },
        responses: {
          "200": { description: "Refund requested", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/events": {
      post: {
        tags: ["API v1"],
        summary: "Create an event (organizer)",
        description: "Structured JSON — ISO datetimes, paise amounts, tier arrays. `isDraft: true` requires only a title.",
        operationId: "v1CreateEvent",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/EventCreateBody" } } } },
        responses: {
          "200": { description: "Created — data.eventId", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/events/{id}": {
      patch: {
        tags: ["API v1"],
        summary: "Update an event (organizer)",
        operationId: "v1UpdateEvent",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/EventUpdateBody" } } } },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/events/{id}/publish": {
      post: {
        tags: ["API v1"], summary: "Publish a draft event", operationId: "v1PublishEvent",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Published", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/events/{id}/cancel": {
      post: {
        tags: ["API v1"], summary: "Cancel an event", operationId: "v1CancelEvent",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" }, cancellationChargePercent: { type: "number" } } } } } },
        responses: { "200": { description: "Cancelled", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/events/{id}/postpone": {
      post: {
        tags: ["API v1"], summary: "Postpone an event to a new date", operationId: "v1PostponeEvent",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["startsAt", "reason"], properties: { startsAt: { type: "string", format: "date-time" }, endsAt: { type: "string", format: "date-time" }, reason: { type: "string" } } } } } },
        responses: { "200": { description: "Postponed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/events/{id}/subscribe": {
      post: {
        tags: ["API v1"], summary: "Subscribe to event updates (Update-Me)", operationId: "v1Subscribe",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Subscribed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
      delete: {
        tags: ["API v1"], summary: "Unsubscribe from event updates", operationId: "v1Unsubscribe",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Unsubscribed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/organizers/{id}/follow": {
      post: {
        tags: ["API v1"], summary: "Follow an organizer", operationId: "v1Follow",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Following", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
      delete: {
        tags: ["API v1"], summary: "Unfollow an organizer", operationId: "v1Unfollow",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Unfollowed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/orders/{id}/approve": {
      post: {
        tags: ["API v1"], summary: "Approve a manual-UPI order (staff)", operationId: "v1ApproveOrder",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Approved", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/orders/{id}/reject": {
      post: {
        tags: ["API v1"], summary: "Reject a manual-UPI order (staff)", operationId: "v1RejectOrder",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } },
        responses: { "200": { description: "Rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/reviews": {
      post: {
        tags: ["API v1"], summary: "Submit a review (needs a USED ticket)", operationId: "v1SubmitReview",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "rating"], properties: { eventId: { type: "string", format: "uuid" }, rating: { type: "integer", minimum: 1, maximum: 5 }, reviewText: { type: "string", maxLength: 1000 } } } } } },
        responses: { "200": { description: "Reviewed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/profile": {
      patch: {
        tags: ["API v1"], summary: "Update own profile", operationId: "v1UpdateProfile",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { fullName: { type: "string" }, phone: { type: "string" }, birthDate: { type: "string" }, gender: { type: "string" }, interestedTags: { type: "array", items: { type: "string" } }, avatarUrl: { type: "string" } } } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/notifications/read": {
      post: {
        tags: ["API v1"], summary: "Mark notification(s) read", operationId: "v1MarkRead",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { notificationId: { type: "string", format: "uuid" }, all: { type: "boolean" } } } } } },
        responses: { "200": { description: "Marked read", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/clubs": {
      post: {
        tags: ["API v1"], summary: "Create a club/crew", operationId: "v1CreateClub",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, bio: { type: "string" }, type: { type: "string", enum: ["CLUB", "CREW"] }, city: { type: "string" }, membershipType: { type: "string", enum: ["FREE", "PAID"] }, membershipFeePaise: { type: "integer" } } } } } },
        responses: { "200": { description: "Created — data.clubId", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/clubs/{id}/join": {
      post: {
        tags: ["API v1"], summary: "Join a club", operationId: "v1JoinClub",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Joined", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/collab/invite": {
      post: {
        tags: ["API v1"], summary: "Invite an organizer as collaborator", operationId: "v1CollabInvite",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "organizerId"], properties: { eventId: { type: "string", format: "uuid" }, organizerId: { type: "string", format: "uuid" }, permissionLevel: { type: "string", enum: ["VIEW_ONLY", "ANALYTICS", "SCAN", "FULL"] } } } } } },
        responses: { "200": { description: "Invited", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/collab/respond": {
      post: {
        tags: ["API v1"], summary: "Accept/reject a collaboration invite", operationId: "v1CollabRespond",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "collaboratorId", "accept"], properties: { eventId: { type: "string", format: "uuid" }, collaboratorId: { type: "string", format: "uuid" }, accept: { type: "boolean" } } } } } },
        responses: { "200": { description: "Responded", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/pins": {
      post: {
        tags: ["API v1"], summary: "Generate scanner/box-office PINs", operationId: "v1GeneratePins",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "type", "staffNames"], properties: { eventId: { type: "string", format: "uuid" }, type: { type: "string", enum: ["scanner", "box-office"] }, staffNames: { type: "array", items: { type: "string" } } } } } } },
        responses: { "200": { description: "PINs generated — data.pins[{pinCode,staffName}]", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/pins/{id}": {
      delete: {
        tags: ["API v1"], summary: "Revoke a PIN", operationId: "v1RevokePin",
        security: [{ SupabaseAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "type"], properties: { eventId: { type: "string", format: "uuid" }, type: { type: "string", enum: ["scanner", "box-office"] } } } } } },
        responses: { "200": { description: "Revoked", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/event-staff": {
      post: {
        tags: ["API v1"], summary: "Add event staff", operationId: "v1AddStaff",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "displayName"], properties: { eventId: { type: "string", format: "uuid" }, email: { type: "string" }, phone: { type: "string" }, displayName: { type: "string" } } } } } },
        responses: { "200": { description: "Added", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
      delete: {
        tags: ["API v1"], summary: "Remove event staff", operationId: "v1RemoveStaff",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "staffId"], properties: { eventId: { type: "string", format: "uuid" }, staffId: { type: "string", format: "uuid" } } } } } },
        responses: { "200": { description: "Removed", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/boosts": {
      post: {
        tags: ["API v1"], summary: "Request a homepage boost slot", operationId: "v1RequestBoost",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "slot", "amountPaidPaise", "startsAt", "endsAt", "utrReference"], properties: { eventId: { type: "string", format: "uuid" }, slot: { type: "integer" }, amountPaidPaise: { type: "integer" }, startsAt: { type: "string" }, endsAt: { type: "string" }, utrReference: { type: "string" } } } } } },
        responses: { "200": { description: "Boost requested", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/organizer": {
      post: {
        tags: ["API v1"], summary: "Create organizer profile (KYC)", operationId: "v1CreateOrganizer",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "upiId", "agreedToTerms"], properties: { name: { type: "string" }, upiId: { type: "string" }, agreedToTerms: { type: "boolean" }, panNumber: { type: "string" }, gstNumber: { type: "string" } } } } } },
        responses: { "200": { description: "Created — data.organizerId", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
      patch: {
        tags: ["API v1"], summary: "Update organizer profile/KYC", operationId: "v1UpdateOrganizer",
        security: [{ SupabaseAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/scanner/login": {
      post: {
        tags: ["API v1"], summary: "Verify scanner PIN (PIN-auth, no Bearer)", operationId: "v1ScannerLogin",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "pin"], properties: { eventId: { type: "string", format: "uuid" }, pin: { type: "string" } } } } } },
        responses: { "200": { description: "PIN valid — data.event info", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { description: "Invalid PIN", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }, "429": { $ref: "#/components/responses/RateLimited" } },
      },
    },
    "/api/v1/scanner/check-in": {
      post: {
        tags: ["API v1"], summary: "Check in a ticket (PIN-auth)", operationId: "v1CheckIn",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["qrHash", "eventId", "pin"], properties: { qrHash: { type: "string" }, eventId: { type: "string", format: "uuid" }, pin: { type: "string" } } } } } },
        responses: { "200": { description: "ScanResult — data.outcome is the verdict (VALID/USED/INVALID/WRONG_EVENT)", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "429": { $ref: "#/components/responses/RateLimited" } },
      },
    },
    "/api/v1/scanner/walkin": {
      post: {
        tags: ["API v1"], summary: "Door staff walk-in sale (PIN-auth)", operationId: "v1ScannerWalkin",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WalkinOrderBody" } } } },
        responses: { "200": { description: "data.ticketId/orderId", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { description: "Invalid PIN", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }, "429": { $ref: "#/components/responses/RateLimited" } },
      },
    },
    "/api/v1/box-office/login": {
      post: {
        tags: ["API v1"], summary: "Verify box-office PIN (PIN-auth)", operationId: "v1BoxOfficeLogin",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["eventId", "pin"], properties: { eventId: { type: "string", format: "uuid" }, pin: { type: "string" } } } } } },
        responses: { "200": { description: "PIN valid — data.event info incl. role", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { description: "Invalid PIN", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }, "429": { $ref: "#/components/responses/RateLimited" } },
      },
    },
    "/api/v1/box-office/orders": {
      post: {
        tags: ["API v1"], summary: "Box-office ticket sale (PIN-auth)", operationId: "v1BoxOfficeOrder",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WalkinOrderBody" } } } },
        responses: { "200": { description: "data.ticketId/orderId", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { description: "Invalid PIN", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }, "429": { $ref: "#/components/responses/RateLimited" } },
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
      SupabaseAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Supabase access token — obtained via supabase.auth.signInWithPassword() " +
          "(or OAuth). Identifies the user for /api/v1/* routes; RLS applies.",
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing or invalid Bearer token",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: { ok: false, error: "Unauthorized" },
          },
        },
      },
      BadRequest: {
        description: "Validation or business error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: { ok: false, error: "Not enough tickets available" },
          },
        },
      },
      RateLimited: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: { ok: false, error: "Too many attempts. Please try again in a minute." },
          },
        },
      },
    },
    schemas: {
      ApiOk: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [true] },
          data: { type: "object", description: "Endpoint-specific payload" },
        },
        required: ["ok", "data"],
      },
      ApiError: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: { type: "string", description: "Human-readable error message" },
        },
        required: ["ok", "error"],
      },
      EventCreateBody: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          thingsToKnow: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          category: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          city: { type: "string" },
          venueName: { type: "string" },
          venueAddress: { type: "string" },
          venueTba: { type: "boolean", description: "Venue announced later" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          googleMapsLink: { type: "string", description: "Required when venueTba=false" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          cardPosterUrl: { type: "string" },
          bannerPosterUrl: { type: "string" },
          teaserVideoUrl: { type: "string" },
          feePayer: { type: "string", enum: ["BUYER", "ORGANIZER"] },
          needsDoorStaff: { type: "boolean" },
          doorStaffCount: { type: "integer" },
          doorStaffAmountPaise: { type: "integer" },
          waitlistEnabled: { type: "boolean" },
          terms: { type: "array", items: { type: "string" } },
          pricingMode: { type: "string", enum: ["FREE", "FLAT", "PAID", "PHASED"] },
          tiers: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "pricePaise", "quantity"],
              properties: {
                name: { type: "string" },
                pricePaise: { type: "integer" },
                quantity: { type: "integer" },
                perks: { type: "array", items: { type: "string" } },
                tierType: { type: "string", enum: ["NAMED", "FLAT_PHASE"] },
                phaseOrder: { type: "integer" },
                phaseOpensAt: { type: "string", format: "date-time" },
                phaseClosesAt: { type: "string", format: "date-time" },
              },
            },
          },
          photoUrls: { type: "array", items: { type: "string" } },
          contactEmail: { type: "string" },
          contactPhone: { type: "string" },
          linkedPastEventIds: { type: "array", items: { type: "string", format: "uuid" } },
          isDraft: { type: "boolean", description: "Save as draft — only title required" },
          acceptedOrganizerTerms: { type: "boolean", description: "Required true to publish" },
        },
      },
      EventUpdateBody: {
        type: "object",
        required: ["title", "startsAt"],
        description: "Same fields as EventCreateBody (partial update semantics)",
      },
      WalkinOrderBody: {
        type: "object",
        required: ["eventId", "pin", "buyerName"],
        properties: {
          eventId: { type: "string", format: "uuid" },
          pin: { type: "string" },
          tierId: { type: "string", format: "uuid" },
          buyerName: { type: "string" },
          buyerPhone: { type: "string" },
          buyerEmail: { type: "string", format: "email" },
          amountPaise: { type: "integer" },
          mode: { type: "string", enum: ["WALKIN_PREEVENT", "WALKIN_QR", "WALKIN_INSTANT"] },
          idempotencyKey: { type: "string", format: "uuid", description: "Client-generated — retries return the same order" },
        },
      },

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

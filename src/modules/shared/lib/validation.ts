import { z } from "zod";

/**
 * Zod validation schemas for server action inputs.
 * These prevent malformed/malicious data from reaching the database.
 * Use `safeParse` to get a typed result or an error message.
 */

// ─── UUID ────────────────────────────────────────────────────────────
const uuid = z.string().uuid();

// ─── Phone ───────────────────────────────────────────────────────────
const phone = z
  .string()
  .trim()
  .min(10, "Phone number must be at least 10 digits")
  .max(15, "Phone number too long")
  .regex(/^[0-9+\-\s()]+$/, "Invalid phone number");

// ─── Email ───────────────────────────────────────────────────────────
const email = z.string().trim().email("Invalid email").max(254).or(z.literal(""));

// ─── PINs ────────────────────────────────────────────────────────────
export const pinSchema = z
  .string()
  .trim()
  .length(6, "PIN must be 6 digits")
  .regex(/^[0-9]{6}$/, "PIN must be numeric");

// ─── Staff names ─────────────────────────────────────────────────────
export const staffNamesSchema = z
  .array(z.string().trim().min(1, "Name required").max(100, "Name too long"))
  .min(1, "At least one staff name required")
  .max(50, "Too many PINs at once");

// ─── Box office order ────────────────────────────────────────────────
export const boxOfficeOrderSchema = z.object({
  eventId: uuid,
  pin: pinSchema,
  tierId: uuid.nullable(),
  buyerName: z.string().trim().min(1, "Name required").max(200, "Name too long"),
  buyerPhone: phone,
  buyerEmail: email.nullable(),
  amountPaise: z.number().int().min(0, "Amount cannot be negative").max(10000000000, "Amount too large"),
  mode: z.enum(["WALKIN_PREEVENT", "WALKIN_QR", "WALKIN_INSTANT"]),
});

// ─── Scanner PIN verify ──────────────────────────────────────────────
export const verifyScannerPinSchema = z.object({
  eventId: uuid,
  pin: pinSchema,
});

// ─── Box office PIN verify ───────────────────────────────────────────
export const verifyBoxOfficePinSchema = z.object({
  eventId: uuid,
  pin: pinSchema,
});

// ─── Check-in with PIN ──────────────────────────────────────────────
export const checkInWithPinSchema = z.object({
  qrHash: z.string().min(16, "Invalid QR hash").max(128, "Invalid QR hash"),
  eventId: uuid,
  pin: pinSchema,
});

// ─── Revoke PIN ──────────────────────────────────────────────────────
export const revokePinSchema = z.object({
  pinId: uuid,
  eventId: uuid,
});

// ─── Generate PINs ──────────────────────────────────────────────────
export const generatePinsSchema = z.object({
  eventId: uuid,
  staffNames: staffNamesSchema,
  role: z.enum(["ORGANIZER", "ADMIN"]).default("ORGANIZER"),
});

// ─── Event create/update (basic fields) ─────────────────────────────
export const eventBasicSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(200, "Title too long"),
  description: z.string().max(10000, "Description too long").optional(),
  city: z.string().min(1, "City required").max(100),
  category: z.string().min(1, "Category required").max(100),
  startsAt: z.string().min(1, "Start date required"),
  endsAt: z.string().optional().nullable(),
  venueName: z.string().max(200).optional().nullable(),
});

// ─── Ticket tier ────────────────────────────────────────────────────
export const ticketTierSchema = z.object({
  name: z.string().trim().min(2, "Tier name must be at least 2 characters").max(100),
  pricePaise: z.number().int().min(0, "Price cannot be negative").max(10000000000),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(100000),
});

// ─── Profile update ──────────────────────────────────────────────────
export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1, "Name required").max(200),
  birthDate: z.string().optional().nullable(),
  phone: phone.optional().nullable(),
  interestedTags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

// ─── Helper: validate and return error string or typed data ─────────
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return { success: false, error: firstError?.message ?? "Invalid input" };
}

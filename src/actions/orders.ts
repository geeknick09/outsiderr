"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  approveOrder,
  checkInTicket,
  createFreeOrder,
  createOrder,
  rejectOrder,
} from "@/lib/data/orders";
import type { ScanResult } from "@/lib/types";

export interface CheckoutState {
  error: string | null;
}

export async function submitPaymentAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await getCurrentUser();
  const eventId = String(formData.get("eventId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const isFree = formData.get("isFree") === "1";

  if (!user) {
    return { error: "Please sign in to continue." };
  }

  // Free events: skip UTR, auto-confirm
  if (isFree) {
    try {
      await createFreeOrder(user, {
        eventId,
        tierId,
        quantity,
        buyerName: String(formData.get("buyerName") ?? "").trim() || user.name,
        buyerPhone: String(formData.get("buyerPhone") ?? "").trim() || (user.phone ?? ""),
        buyerEmail: String(formData.get("buyerEmail") ?? "").trim() || null,
        buyerGender: String(formData.get("buyerGender") ?? "").trim() || null,
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not complete RSVP.",
      };
    }
    revalidatePath("/tickets");
    redirect("/tickets?submitted=1");
  }

  // Paid events: require UTR
  const utrReference = String(formData.get("utrReference") ?? "").trim();
  if (utrReference.length < 6) {
    return { error: "Enter the UTR / transaction reference from your UPI app." };
  }

  try {
    await createOrder(user, {
      eventId,
      tierId,
      quantity,
      utrReference,
      paymentProofUrl: (String(formData.get("paymentProofUrl") ?? "") || null),
      buyerName: String(formData.get("buyerName") ?? "").trim() || user.name,
      buyerPhone: String(formData.get("buyerPhone") ?? "").trim() || (user.phone ?? ""),
      buyerEmail: String(formData.get("buyerEmail") ?? "").trim() || null,
      buyerGender: String(formData.get("buyerGender") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not submit payment." };
  }

  revalidatePath("/tickets");
  redirect("/tickets?submitted=1");
}

export async function approveOrderAction(formData: FormData): Promise<void> {
  try {
    await approveOrder(String(formData.get("orderId") ?? ""));
  } catch (err) {
    console.error("approveOrderAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to approve order.";
    throw new Error(message);
  }
  revalidatePath("/organizer");
  revalidatePath("/tickets");
}

export async function rejectOrderAction(formData: FormData): Promise<void> {
  try {
    await rejectOrder(
      String(formData.get("orderId") ?? ""),
      String(formData.get("reason") ?? "").trim(),
    );
  } catch (err) {
    console.error("rejectOrderAction error:", err);
    const message =
      err instanceof Error ? err.message :
      typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) :
      "Failed to reject order.";
    throw new Error(message);
  }
  revalidatePath("/organizer");
  revalidatePath("/tickets");
}

export async function checkInTicketAction(qrHash: string, eventId: string): Promise<ScanResult> {
  try {
    return await checkInTicket(qrHash, eventId);
  } catch (error) {
    return {
      outcome: "INVALID",
      message: error instanceof Error ? error.message : "Scan failed.",
    };
  }
}

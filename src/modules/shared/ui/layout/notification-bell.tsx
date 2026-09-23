"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/modules/shared/actions/notifications";
import { useRealtime } from "../../hooks/use-realtime";
import type { UserNotification } from "../../data/notifications";
import { formatDateTime } from "../../lib/format";

const TYPE_LABELS: Record<string, string> = {
  CANCELLATION: "Event Cancelled",
  POSTPONEMENT: "Event Postponed",
  RESCHEDULE: "Event Rescheduled",
  WAITLIST_OFFER: "Ticket Available!",
  VENUE_CHANGE: "Venue Changed",
  CITY_CHANGE: "City Changed",
  TIME_CHANGE: "Time Changed",
  ORDER_CONFIRMED: "Order Confirmed",
  ORDER_REJECTED: "Order Rejected",
  PAYMENT_SUCCESS: "Payment Successful",
  PAYMENT_FAILED: "Payment Failed",
  REFUND_INITIATED: "Refund Initiated",
  REFUND_COMPLETED: "Refund Completed",
  PAYOUT_COMPLETED: "Payout Completed",
  EVENT_UPDATE: "Event Update",
  EVENT_REMINDER: "Event Reminder",
  TICKETS_AVAILABLE: "Tickets Available",
  COLLAB_INVITE: "Collaboration Invite",
  COLLAB_ACCEPTED: "Collaboration Accepted",
  KYC_APPROVED: "Organizer Verified!",
  KYC_REJECTED: "Application Rejected",
  KYC_CLARIFICATION: "Clarification Needed",
  KYC_SUBMITTED: "KYC Submitted",
  BOOST_REQUESTED: "Boost Request",
  DOOR_STAFF_REQUESTED: "Door Staff Payment",
  HERO_BOOST: "Boost Update",
};

const TYPE_COLORS: Record<string, string> = {
  CANCELLATION: "text-red-500",
  POSTPONEMENT: "text-amber-500",
  RESCHEDULE: "text-amber-500",
  WAITLIST_OFFER: "text-emerald-500",
  VENUE_CHANGE: "text-violet-neon",
  CITY_CHANGE: "text-violet-neon",
  TIME_CHANGE: "text-violet-neon",
  ORDER_CONFIRMED: "text-emerald-500",
  ORDER_REJECTED: "text-red-500",
  PAYMENT_SUCCESS: "text-emerald-500",
  PAYMENT_FAILED: "text-red-500",
  REFUND_INITIATED: "text-amber-500",
  REFUND_COMPLETED: "text-emerald-500",
  PAYOUT_COMPLETED: "text-emerald-500",
  KYC_APPROVED: "text-emerald-500",
  KYC_REJECTED: "text-red-500",
  KYC_CLARIFICATION: "text-amber-500",
  KYC_SUBMITTED: "text-amber-500",
  BOOST_REQUESTED: "text-amber-500",
  DOOR_STAFF_REQUESTED: "text-amber-500",
  COLLAB_INVITE: "text-violet-neon",
  COLLAB_ACCEPTED: "text-emerald-500",
};

export function NotificationBell({
  userId,
  initialNotifications,
  initialUnreadCount,
}: {
  userId: string;
  initialNotifications: UserNotification[];
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const containerRef = useRef<HTMLDivElement>(null);

  // Realtime: live notification updates without page reload
  useRealtime({
    channelName: `notifications:${userId}`,
    table: "event_notifications",
    event: "INSERT",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ new: row }) => {
      const newNotif: UserNotification = {
        id: row.id as string,
        eventId: row.event_id as string,
        type: row.type as string,
        message: row.message as string,
        read: false,
        createdAt: row.created_at as string,
        eventTitle: undefined,
      };
      setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
      setUnreadCount((c) => c + 1);
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  }

  async function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    await markNotificationReadAction(id);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="glass relative flex h-10 w-10 items-center justify-center rounded-full transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="glass absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-900"
          >
            {unreadCount > 0 ? (
              <div className="flex justify-end border-b border-zinc-200 px-2 py-2 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="flex items-center gap-1 text-xs font-semibold text-violet-neon hover:underline"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              </div>
            ) : null}

            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">
                No notifications yet.
              </p>
            ) : (
              <div className="space-y-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl p-3 transition-colors ${
                      n.read
                        ? "bg-transparent"
                        : "bg-violet-neon/5 border border-violet-neon/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-bold ${TYPE_COLORS[n.type] ?? "text-violet-neon"}`}>
                          {TYPE_LABELS[n.type] ?? n.type}
                        </p>
                        {n.eventTitle ? (
                          <Link
                            href={`/events/${n.eventId}`}
                            onClick={() => setOpen(false)}
                            className="block truncate text-sm font-semibold hover:text-violet-neon"
                          >
                            {n.eventTitle}
                          </Link>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted">{n.message}</p>
                        <p className="mt-1 text-[10px] text-muted">{formatDateTime(n.createdAt)}</p>
                      </div>
                      {!n.read ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(n.id)}
                          className="shrink-0 rounded-lg p-1 text-muted hover:text-violet-neon"
                          aria-label="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

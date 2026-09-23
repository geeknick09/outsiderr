import { Clock, XCircle, HelpCircle } from "lucide-react";

export function KycStatusBanner({ kycStatus }: { kycStatus: string }) {
  if (kycStatus === "APPROVED" || kycStatus === "NOT_SUBMITTED") return null;

  const config: Record<string, { icon: React.ElementType; title: string; message: string; className: string }> = {
    PENDING: {
      icon: Clock,
      title: "KYC Under Review",
      message: "Your organizer application is being reviewed by our team. You'll be notified once it's approved. This usually takes 1-2 business days.",
      className: "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5",
    },
    REJECTED: {
      icon: XCircle,
      title: "KYC Rejected",
      message: "Your organizer application was not approved. Please review the note below and re-submit with corrected information.",
      className: "border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/5",
    },
    CLARIFICATION_NEEDED: {
      icon: HelpCircle,
      title: "Clarification Needed",
      message: "We need some additional information before we can approve your application. Check the note below and respond right here.",
      className: "border-blue-300 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/5",
    },
  };

  const c = config[kycStatus];
  if (!c) return null;

  const Icon = c.icon;

  return (
    <div className={`glass rounded-3xl border-2 p-5 ${c.className}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h3 className="text-base font-bold">{c.title}</h3>
          <p className="mt-1 text-sm text-muted">{c.message}</p>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSubscription } from "../../subscription/useSubscription";
import { createSubscriptionCheckout, postSubscriptionPortal } from "../../api";
import { message } from "antd";

type SubscriptionStatus = "free" | "pro" | "cancelled";
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const styles: Record<SubscriptionStatus, string> = {
    free: "bg-gray-100 text-gray-600",
    pro: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-amber-100 text-amber-700",
  };
  const labels: Record<SubscriptionStatus, string> = {
    free: "Free plan",
    pro: "Pro",
    cancelled: "Cancelled",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

const PRO_FEATURES = [
  "Tailored resume and cover letter per job",
  "Unlimited auto-submissions",
];

export function SubscriptionSettingsPage() {
  const { currentPeriodEnd, subscriptionStatus, loading } = useSubscription();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);

  const onUpgrade = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { url } = await createSubscriptionCheckout();
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upgrade failed";
      message.error(msg);
    } finally {
      setCreating(false);
    }
  }, [creating]);

  const onManageBilling = useCallback(async () => {
    if (managing) return;
    setManaging(true);
    try {
      const { url } = await postSubscriptionPortal();
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Manage billing failed";
      message.error(msg);
    } finally {
      setManaging(false);
    }
  }, [managing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Status card */}
      <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            Current plan
          </span>
          <StatusBadge status={subscriptionStatus} />
        </div>

        {/* FREE */}
        {subscriptionStatus === "free" && (
          <>
            <p className="text-sm text-gray-500">
              You're on the free plan. Upgrade to unlock the full AutoApply
              experience.
            </p>
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-gray-400"
                >
                  <CheckCircle2 className="w-4 h-4 text-gray-300 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={onUpgrade}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Upgrade to Pro — $9/mo
            </button>
          </>
        )}

        {/* PRO */}
        {subscriptionStatus === "pro" && (
          <>
            {currentPeriodEnd && (
              <p className="text-sm text-gray-500">
                Your plan renews on{" "}
                <span className="text-gray-700 font-medium">
                  {formatDate(currentPeriodEnd)}
                </span>
              </p>
            )}
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* Cancel flow */}
            <button
              onClick={onManageBilling}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              Manage billing
            </button>
          </>
        )}

        {/* CANCELLED */}
        {subscriptionStatus === "cancelled" && (
          <>
            {currentPeriodEnd && (
              <p className="text-sm text-gray-500">
                Your Pro access expires on{" "}
                <span className="text-gray-700 font-medium">
                  {formatDate(currentPeriodEnd)}
                </span>
                . After that your account reverts to free.
              </p>
            )}
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-gray-400"
                >
                  <CheckCircle2 className="w-4 h-4 text-gray-300 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={onUpgrade}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Reactivate Pro — $9/mo
            </button>
          </>
        )}
      </div>
    </div>
  );
}

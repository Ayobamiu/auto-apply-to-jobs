import React, { useCallback, useEffect, useState } from "react";
import { message } from "antd";
import { createSubscriptionCheckout } from "../api";
import type { UpgradeTrigger } from "./useSubscription";

export function UpgradeModal({
  open,
  trigger,
  onClose,
}: {
  open: boolean;
  trigger: UpgradeTrigger;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) setCreating(false);
  }, [open]);

  const copy =
    trigger === "documents"
      ? {
          headline: "Get a resume tailored to this job",
          body: "Pro generates a custom resume and cover letter for every application — not a generic one.",
        }
      : {
          headline: "Auto-submit this application",
          body: "Stop copying and pasting. Pro submits the completed form for you automatically.",
        };

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000] p-5 bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-border rounded-xl w-full max-w-[540px] overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {copy.headline}
            </h2>
            <p className="text-sm  mt-2 text-gray-500">{copy.body}</p>
          </div>
          <button
            type="button"
            className="py-1.5 px-3 border border-border rounded-lg text-[13px] cursor-pointer hover:bg-border text-gray-500"
            onClick={onClose}
            disabled={creating}
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <div className="text-sm text-gray-900">Pro — $9/mo</div>
            <div className="text-xs text-gray-500">Cancel anytime</div>
          </div>

          <button
            type="button"
            onClick={onUpgrade}
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed border-0 cursor-pointer transition-colors"
          >
            {creating ? "Redirecting…" : "Upgrade to Pro"}
          </button>

          <p className="text-xs text-gray-500">
            You will be redirected to Stripe to complete checkout.
          </p>
        </div>
      </div>
    </div>
  );
}

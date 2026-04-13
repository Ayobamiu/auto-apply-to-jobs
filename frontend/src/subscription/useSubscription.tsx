import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getSubscriptionStatus,
  SubscriptionStatus,
  type SubscriptionStatusResponse,
} from "../api";
import { UpgradeModal } from "./UpgradeModal";

export type UpgradeTrigger = "documents" | "submit";

type SubscriptionContextValue = {
  isPro: boolean;
  loading: boolean;
  openUpgradeModal: (trigger: UpgradeTrigger) => void;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] =
    useState<UpgradeTrigger>("submit");
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus>("free");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);

  const closeUpgradeModal = useCallback(() => setUpgradeOpen(false), []);

  const openUpgradeModal = useCallback((trigger: UpgradeTrigger) => {
    setUpgradeTrigger(trigger);
    setUpgradeOpen(true);
  }, []);

  const applyStatus = useCallback((status: SubscriptionStatusResponse) => {
    setIsPro(status.subscription_status === "pro");
    setSubscriptionStatus(status.subscription_status);
    setCurrentPeriodEnd(status.current_period_end);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const gapsMs = [400, 700, 1200];
      let succeeded = false;

      for (let attempt = 0; attempt <= gapsMs.length; attempt++) {
        if (cancelled) return;
        if (attempt > 0) {
          await sleep(gapsMs[attempt - 1]!);
        }
        if (cancelled) return;

        try {
          const status: SubscriptionStatusResponse =
            await getSubscriptionStatus();
          if (cancelled) return;
          applyStatus(status);
          succeeded = true;
          break;
        } catch {
          /* next attempt after backoff */
        }
      }

      if (cancelled) return;
      if (!succeeded) {
        setIsPro(false);
      }
    }

    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const status = await getSubscriptionStatus();
          applyStatus(status);
        } catch {
          /* keep existing isPro — transient errors must not demote the user */
        }
      })();
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [applyStatus]);

  const value = useMemo(
    () => ({
      isPro,
      loading,
      openUpgradeModal,
      subscriptionStatus,
      currentPeriodEnd,
    }),
    [isPro, loading, openUpgradeModal, subscriptionStatus, currentPeriodEnd],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      {upgradeOpen && (
        <UpgradeModal
          open={upgradeOpen}
          trigger={upgradeTrigger}
          onClose={closeUpgradeModal}
        />
      )}
    </SubscriptionContext.Provider>
  );
}

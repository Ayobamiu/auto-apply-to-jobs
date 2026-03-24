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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const status: SubscriptionStatusResponse =
          await getSubscriptionStatus();
        if (cancelled) return;
        setIsPro(status.subscription_status === "pro");
        setSubscriptionStatus(status.subscription_status);
        setCurrentPeriodEnd(status.current_period_end);
      } catch {
        if (cancelled) return;
        setIsPro(false);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      isPro,
      loading,
      openUpgradeModal,
      subscriptionStatus,
      currentPeriodEnd,
    }),
    [isPro, loading, openUpgradeModal],
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

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import {
  getHandshakeSessionStatus,
  type HandshakeSessionStatus,
} from "../../api";
import { useOnboarding } from "../../hooks/useOnboarding";

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

function getToken(): string {
  return typeof localStorage !== "undefined"
    ? (localStorage.getItem("token") ?? "")
    : "";
}

export function HandshakeSettingsSection() {
  const { refetch: refetchOnboarding } = useOnboarding();
  const [status, setStatus] = useState<HandshakeSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getHandshakeSessionStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    await refetchOnboarding();
    setRefreshing(false);
  }, [load, refetchOnboarding]);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(getToken());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  }, []);

  const isConnected = status?.connected && !status?.expired;
  const isExpired = status?.connected && status?.expired;
  const isDisconnected = !status?.connected;

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Merit uses your Handshake session to submit applications on your behalf.
        Keep your session active so applications can run smoothly.
      </p>

      {/* Status card */}
      {loading ? (
        <div className="flex items-center gap-2 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Checking connection…</span>
        </div>
      ) : (
        <div
          className={`flex items-start gap-4 p-4 rounded-2xl border ${
            isConnected
              ? "bg-emerald-50 border-emerald-100"
              : isExpired
                ? "bg-amber-50 border-amber-100"
                : "bg-red-50 border-red-100"
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            ) : isExpired ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold ${
                isConnected
                  ? "text-emerald-800"
                  : isExpired
                    ? "text-amber-800"
                    : "text-red-700"
              }`}
            >
              {isConnected
                ? "Connected to Handshake"
                : isExpired
                  ? "Session expired"
                  : "Not connected"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                isConnected
                  ? "text-emerald-600"
                  : isExpired
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {isConnected
                ? "Your session is active and ready for applications."
                : isExpired
                  ? "Your Handshake session has expired. Follow the steps below to reconnect."
                  : "Connect your Handshake account to enable automatic applications."}
            </p>
            {status?.updatedAt && (
              <p className="text-xs text-gray-400 mt-1">
                Last checked: {new Date(status.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh status"
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 bg-transparent border-0 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      )}

      {/* Reconnect guide — shown when expired or disconnected */}
      {!loading && !isConnected && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-800">
              Steps to connect your Handshake account (Requires Chrome browser)
            </p>

            <ol className="space-y-3">
              {[
                <span className="text-sm text-gray-600">
                  Install the{" "}
                  <a
                    href="https://chromewebstore.google.com/detail/elkggcpakhdlemcodpfljekmhlfnkjbe?utm_source=item-share-cb"
                    target="_blank"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Handshake Sync Pro chrome extension
                  </a>{" "}
                  (if you haven't already).
                </span>,
                <span className="text-sm text-gray-600">
                  Open Handshake in your browser and make sure you're logged in.
                </span>,

                <span className="text-sm text-gray-600">
                  Click the refresh button above to verify the connection.
                </span>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

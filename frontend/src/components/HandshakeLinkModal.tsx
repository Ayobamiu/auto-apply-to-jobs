import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Link2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { postPipeline, getPipelineJobStatus } from "../api";

interface HandshakeLinkModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "idle" | "fetching" | "generating" | "preparing" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "",
  fetching: "Fetching job details…",
  generating: "Generating resume and cover letter…",
  preparing: "Preparing your application…",
  done: "Ready! Taking you to the job…",
  error: "",
};

function parseHandshakeJobRef(url: string): string | null {
  const m = url.match(/\/jobs\/(\d+)/);
  return m ? `handshake:${m[1]}` : null;
}

function mapPhaseToStep(
  phase: string | null | undefined,
  status: string,
): Step {
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "done" || status === "awaiting_approval") return "done";
  if (!phase) return "fetching";
  const p = phase.toLowerCase();
  if (p.includes("scrape") || p.includes("fetch")) return "fetching";
  if (p.includes("resume") || p.includes("cover") || p.includes("generat"))
    return "generating";
  if (p.includes("apply") || p.includes("prepar") || p.includes("submit"))
    return "preparing";
  return "generating";
}

const STEP_ORDER: Step[] = ["fetching", "generating", "preparing", "done"];

export function HandshakeLinkModal({ open, onClose }: HandshakeLinkModalProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [jobRef, setJobRef] = useState<string | null>(null);
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const pollingRef = useRef<boolean>(false);
  const pollingTimerRef = useRef<number | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  const resetState = useCallback(() => {
    setUrl("");
    setStep("idle");
    setErrorMsg("");
    setJobRef(null);
    setPipelineJobId(null);
    pollingRef.current = false;
    if (pollingTimerRef.current != null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (redirectTimerRef.current != null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // Poll pipeline status to advance steps
  useEffect(() => {
    if (
      !pipelineJobId ||
      step === "done" ||
      step === "error" ||
      step === "idle"
    )
      return;
    pollingRef.current = true;

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const s = await getPipelineJobStatus(pipelineJobId);
        const nextStep = mapPhaseToStep(s.phase, s.status ?? "running");
        setStep(nextStep);

        if (nextStep === "done") {
          pollingRef.current = false;
          const refToUse = jobRef;
          // Use separate ref for redirect timer so effect cleanup doesn't clear it
          redirectTimerRef.current = window.setTimeout(() => {
            if (refToUse)
              navigate(`/discover/job/${encodeURIComponent(refToUse)}`);
            handleClose();
          }, 1200);
          return;
        }
        if (nextStep === "error") {
          pollingRef.current = false;
          setErrorMsg(s.error ?? "Something went wrong. Please try again.");
          return;
        }
      } catch {
        // transient error — keep polling
      }
      if (pollingRef.current) {
        pollingTimerRef.current = window.setTimeout(poll, 2000);
      }
    };

    void poll();
    return () => {
      pollingRef.current = false;
      if (pollingTimerRef.current != null)
        window.clearTimeout(pollingTimerRef.current);
    };
  }, [pipelineJobId, jobRef, handleClose, navigate, step]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;

      const ref = parseHandshakeJobRef(trimmed);
      if (!ref) {
        setErrorMsg(
          "Couldn't find a job ID in that link. Make sure it's a Handshake job URL.",
        );
        return;
      }

      setErrorMsg("");
      setStep("fetching");
      setJobRef(ref);

      try {
        const { jobId } = await postPipeline(trimmed, { submit: false });
        setPipelineJobId(jobId);
      } catch (err) {
        setStep("error");
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Failed to start. Please try again.",
        );
      }
    },
    [url],
  );

  if (!open) return null;

  const isRunning = step !== "idle" && step !== "error";
  const currentStepIdx = STEP_ORDER.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Start application from Handshake link"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={isRunning ? undefined : handleClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-[17px] font-semibold text-gray-900">
              Start from a Handshake link
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              We'll generate a tailored resume and cover letter for you.
            </p>
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={handleClose}
              className="ml-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors bg-transparent border-0 cursor-pointer flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === "idle" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Paste your Handshake job link
                </span>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setErrorMsg("");
                    }}
                    placeholder="https://app.joinhandshake.com/jobs/…"
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
                  />
                </div>
                {errorMsg && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{" "}
                    {errorMsg}
                  </p>
                )}
              </label>

              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">How it works</p>
                <p>1. Paste the link to any Handshake job posting</p>
                <p>2. We fetch the job details and create tailored documents</p>
                <p>3. Review and edit before submitting</p>
              </div>

              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-0 cursor-pointer"
              >
                Start Application
              </button>
            </form>
          )}

          {isRunning && (
            <div className="flex flex-col gap-5">
              {/* Progress steps */}
              <div className="flex flex-col gap-3">
                {STEP_ORDER.filter((s) => s !== "done" || step === "done").map(
                  (s, idx) => {
                    const isPast = currentStepIdx > idx;
                    const isCurrent = currentStepIdx === idx;
                    return (
                      <div key={s} className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                            isPast || (s === "done" && step === "done")
                              ? "bg-green-500"
                              : isCurrent
                                ? "bg-blue-600"
                                : "bg-gray-200"
                          }`}
                        >
                          {isPast || (s === "done" && step === "done") ? (
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                          ) : isCurrent ? (
                            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                          )}
                        </div>
                        <span
                          className={`text-sm ${
                            isCurrent
                              ? "text-gray-900 font-medium"
                              : isPast
                                ? "text-gray-400 line-through"
                                : "text-gray-400"
                          }`}
                        >
                          {STEP_LABELS[s]}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">
                    Something went wrong
                  </p>
                  {errorMsg && (
                    <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={resetState}
                className="w-full py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 border-0 cursor-pointer transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 bg-transparent border-0 cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { cloneDeep } from "lodash";

interface HistoryEntry {
  resume: Record<string, unknown>;
  label: string;
}

const MAX_HISTORY = 50;

export function useResumeHistory(initialResume: Record<string, unknown>) {
  const [resume, setResumeRaw] = useState<Record<string, unknown>>(initialResume);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const setResume = useCallback(
    (next: Record<string, unknown>, label = "Edit") => {
      setPast((prev) => {
        const entry: HistoryEntry = { resume: cloneDeep(resume), label };
        const updated = [...prev, entry];
        return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
      });
      setFuture([]);
      setResumeRaw(next);
    },
    [resume],
  );

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture((f) => [...f, { resume: cloneDeep(resume), label: last.label }]);
      setResumeRaw(last.resume);
      return prev.slice(0, -1);
    });
  }, [resume]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPast((p) => [...p, { resume: cloneDeep(resume), label: last.label }]);
      setResumeRaw(last.resume);
      return prev.slice(0, -1);
    });
  }, [resume]);

  const resetHistory = useCallback((next: Record<string, unknown>) => {
    setResumeRaw(next);
    setPast([]);
    setFuture([]);
  }, []);

  return {
    resume,
    setResume,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    resetHistory,
  };
}

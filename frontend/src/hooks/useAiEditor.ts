import { useState } from "react";
import { cloneDeep } from "lodash";
import { Resume } from "../types/resume";
import { validateResumeFragment } from "../utils/ajv-setup";
import initialResume from "../sample-resume.json";
import { applyPatch, getValueByPointer } from "fast-json-patch";
import type { ProposedPatch } from "../resume-editor/utils";
import { Patch } from "../api";

const STORAGE_KEY = "auto-apply-resume-editor-draft";

function loadResumeFromStorage(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialResume as Record<string, unknown>;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed
      : (initialResume as Record<string, unknown>);
  } catch {
    return initialResume as Record<string, unknown>;
  }
}

export const useAiEditor = (_initial: Resume, onSave: (next: any) => void) => {
  const [resume, setResume] = useState<Record<string, unknown>>(loadResumeFromStorage);
  const [proposedPatches, setProposedPatches] = useState<ProposedPatch[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleAiUpdate = async (aiResponse: { patches: Patch[] }) => {
    const validated: ProposedPatch[] = [];
    for (const p of aiResponse.patches) {
      let sanitizedData = p.value;

      // 1. Only validate if it's NOT a 'remove' operation
      if (p.op !== 'remove') {
        const { isValid, sanitizedData: cleaned } = validateResumeFragment(p.path, p.value);
        if (!isValid) {
          console.warn(`Validation failed for ${p.path}`);
          continue;
        }
        sanitizedData = cleaned;
      }

      // 2. Capture the 'original' value so you can show the user WHAT is being deleted
      let original: unknown;
      try {
        original = getValueByPointer(resume, p.path);
      } catch {
        original = undefined;
      }

      validated.push({
        op: p.op as ProposedPatch["op"],
        path: p.path,
        value: sanitizedData,
        original,
      });
    }
    if (validated.length > 0) setProposedPatches(validated);
  };

  const commitOne = (index: number) => {
    const patch = proposedPatches[index];
    if (!patch) return;
    const next = cloneDeep(resume);
    applyPatch(next, [{ op: patch.op, path: patch.path, value: patch.value } as any]);
    setResume(next);
    onSave(next);
    const remaining = proposedPatches.filter((_, i) => i !== index).map(p => {
      let original: unknown;
      try { original = getValueByPointer(next, p.path); } catch { original = undefined; }
      return { ...p, original };
    });
    setProposedPatches(remaining);
    if (remaining.length === 0) {
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
    }
  };

  const commitAll = () => {
    if (proposedPatches.length === 0) return;
    const next = cloneDeep(resume);
    applyPatch(next, proposedPatches.map(p => ({ op: p.op, path: p.path, value: p.value }) as any));
    setResume(next);
    onSave(next);
    setProposedPatches([]);
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 2000);
  };

  const discardOne = (index: number) => {
    setProposedPatches(prev => prev.filter((_, i) => i !== index));
  };

  const discardAll = () => setProposedPatches([]);

  return {
    resume, proposedPatches, handleAiUpdate, setResume,
    commitOne, commitAll, discardOne, discardAll, isSuccess,
  };
};

import { useState, useCallback } from "react";
import { cloneDeep } from "lodash";
import { validateResumeFragment } from "../utils/ajv-setup";
import { applyPatch, getValueByPointer } from "fast-json-patch";
import {
  pathToReviewLabel,
  type ProposedPatch,
  resolvePointerAppendSegment,
  collapseArrayMovesToSingleReplace,
} from "../resume-editor/utils";
import type { Patch } from "../api";
import { useResumeHistory } from "./useResumeHistory";

export interface UseAiEditorOptions {
  initialResume: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => void;
}

export const useAiEditor = ({ initialResume, onSave }: UseAiEditorOptions) => {
  const {
    resume, setResume, undo, redo, canUndo, canRedo, resetHistory,
  } = useResumeHistory(initialResume);
  const [proposedPatches, setProposedPatches] = useState<ProposedPatch[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  const resetResume = useCallback((next: Record<string, unknown>) => {
    resetHistory(next);
    setProposedPatches([]);
  }, [resetHistory]);

  const handleAiUpdate = useCallback(async (aiResponse: { patches: Patch[] }) => {
    const validated: ProposedPatch[] = [];
    for (const p of aiResponse.patches) {
      let sanitizedData = p.value;
      const pathNorm = p.path.startsWith("/") ? p.path : `/${p.path}`;
      const pathForValidate =
        p.op === "add" ? resolvePointerAppendSegment(resume, pathNorm) : pathNorm;
      if (p.op !== "remove" && p.op !== "move") {
        const { isValid, sanitizedData: cleaned } = validateResumeFragment(
          pathForValidate,
          p.value,
        );
        if (!isValid) continue;
        sanitizedData = cleaned;
      }
      let original: unknown;
      try {
        original = getValueByPointer(resume, pathNorm);
      } catch {
        original = undefined;
      }
      const proposed: ProposedPatch = {
        op: p.op as ProposedPatch["op"],
        path: pathNorm,
        value: sanitizedData,
        original,
      };
      if ((p.op === "move" || p.op === "copy") && p.from) {
        proposed.from = p.from.startsWith("/") ? p.from : `/${p.from}`;
        try {
          proposed.fromOriginal = getValueByPointer(resume, proposed.from);
        } catch {
          proposed.fromOriginal = undefined;
        }
        // For move ops, the value is the thing being moved (from the source)
        if (p.op === "move") proposed.value = proposed.fromOriginal;
      }
      validated.push(proposed);
    }
    const folded = collapseArrayMovesToSingleReplace(resume, validated);
    if (folded.length > 0) setProposedPatches(folded);
  }, [resume]);

  const commitOne = useCallback((index: number) => {
    const patch = proposedPatches[index];
    if (!patch) return;
    const next = cloneDeep(resume);
    const patchOp: any = { op: patch.op, path: patch.path, value: patch.value };
    if (patch.from) patchOp.from = patch.from;
    applyPatch(next, [patchOp]);
    const label = `Accept: ${pathToReviewLabel(patch.path)}`;
    setResume(next, label);
    onSave(next);
    const remaining = proposedPatches.filter((_, i) => i !== index).map(p => {
      let original: unknown;
      try { original = getValueByPointer(next, p.path); } catch { original = undefined; }
      return { ...p, original };
    });
    setProposedPatches(remaining);
    if (remaining.length === 0) { setIsSuccess(true); setTimeout(() => setIsSuccess(false), 2000); }
  }, [proposedPatches, resume, onSave, setResume]);

  const commitAll = useCallback(() => {
    if (proposedPatches.length === 0) return;
    const next = cloneDeep(resume);
    applyPatch(next, proposedPatches.map(p => {
      const op: any = { op: p.op, path: p.path, value: p.value };
      if (p.from) op.from = p.from;
      return op;
    }));
    setResume(next, "Accept all AI changes");
    onSave(next);
    setProposedPatches([]);
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 2000);
  }, [proposedPatches, resume, onSave, setResume]);

  const discardOne = useCallback((index: number) => {
    setProposedPatches(prev => prev.filter((_, i) => i !== index));
  }, []);

  const discardAll = useCallback(() => setProposedPatches([]), []);

  return {
    resume, proposedPatches, handleAiUpdate, setResume, resetResume,
    commitOne, commitAll, discardOne, discardAll, isSuccess,
    undo, redo, canUndo, canRedo,
  };
};

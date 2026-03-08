import React from "react";
import { diffWords } from "diff";

interface DiffViewProps {
  original: string;
  proposed: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ original, proposed }) => {
  // 1. Calculate the word-level differences
  const diff = diffWords(original || "", proposed || "");

  return (
    <span className="leading-relaxed">
      {diff.map((part, index) => {
        // 2. Style based on the type of change
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-emerald-100 text-emerald-900 px-0.5 rounded shadow-sm border-b-2 border-emerald-400 mx-0.5"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-rose-100 text-rose-800 line-through opacity-70 px-0.5 mx-0.5"
            >
              {part.value}
            </span>
          );
        }
        // 3. Unchanged text
        return (
          <span key={index} className="text-slate-700">
            {part.value}
          </span>
        );
      })}
    </span>
  );
};

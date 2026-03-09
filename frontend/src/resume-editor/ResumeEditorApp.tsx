import { useState, useCallback, useEffect } from "react";
import initialResume from "../sample-resume.json";
import { ResumeDocument } from "./ResumeDocument";
import { Check, Send, Sparkles, XIcon } from "lucide-react";
import { useAiEditor } from "../hooks/useAiEditor";
import { ReviewBar } from "../components/ReviewBar";

const STORAGE_KEY = "auto-apply-resume-editor-draft";

export function ResumeEditorApp() {
  const handleChange = useCallback((next: Record<string, unknown>) => {
    setResume(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota or other storage errors
    }
  }, []);

  const {
    resume,
    proposedPatches,
    handleAiUpdate,
    setResume,
    commitOne,
    commitAll,
    discardOne,
    discardAll,
  } = useAiEditor(initialResume, handleChange);

  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleGenerate = async () => {
    if (!aiInput && !selectedNode) return;

    setIsGenerating(true);

    // 1. Simulate API Latency
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const responses = {
      // 1. UPDATE: Leaf node (Specific bullet point)
      response1: {
        patches: [
          {
            path: "/work/0/highlights/0",
            op: "replace",
            value:
              "Architected patient-facing eligibility verification flows in React/Node.js, automating manual checks to reduce clinic workload by 40%. Updated the highlights to include the new feature.",
          },
        ],
      },

      // 2. UPDATE: String field (Summary)
      response2: {
        patches: [
          {
            path: "/basics/summary",
            op: "replace",
            value:
              "UUU Software Engineer focused on healthcare innovation. Skilled in building scalable full-stack systems, AI-driven document parsing, and clinical workflow automation with a focus on real-world impact.",
          },
          {
            path: "/work/0/highlights/0",
            op: "replace",
            value:
              "Architected patient-facing eligibility verification flows in React/Node.js, automating manual checks to reduce clinic workload by 40%. Updated the highlights to include the new feature.",
          },
        ],
      },

      // 3. UPDATE: Full Object (Core Extract role)
      response3: {
        patches: [
          {
            path: "/work/1",
            op: "replace",
            value: {
              name: "Core Extract",
              position: "Lead Software Engineer",
              startDate: "2025-09-01",
              highlights: [
                "Spearheaded a multi-stage document parsing system using Python, Rust, and ML to structure medical data.",
                "Increased OCR accuracy by 25% by integrating layout models and domain-specific validation pipelines.",
                "Mentored junior developers on Rust integration and performance optimization.",
              ],
            },
          },
        ],
      },

      // 4. UPDATE: Array Object (Skills category)
      response4: {
        patches: [
          {
            path: "/skills/0",
            op: "replace",
            value: {
              name: "Full-Stack Development",
              keywords: [
                "TypeScript",
                "Node.js",
                "React",
                "Python",
                "Rust",
                "PostgreSQL",
                "GraphQL",
                "Docker",
                "Tailwind CSS",
                "shadcn UI",
                "SWR",
                "Zustand",
              ],
            },
          },
        ],
      },

      // 5. INSERT: Brand New Section (Volunteer)
      // Use this to test if your UI renders the "Volunteer" header when it was previously empty
      response5: {
        patches: [
          {
            path: "/volunteer/3",
            op: "add",
            value: {
              organization: "Acme Inc",
              position: "Volunteer Software Engineer",
              url: "https://acme.org",
              startDate: "2026-02-01",
              summary:
                "Contributed to open-source healthcare tooling and community outreach.",
              highlights: [
                "Developed a community portal using Next.js",
                "Assisted in data migration for local non-profits",
              ],
            },
          },
        ],
      },

      // 6. INSERT: Adding to an existing list (Project)
      // Tests if your push logic adds to the end of the array correctly
      response6: {
        patches: [
          {
            path: "/projects/3", // If projects[] is empty, this is the first
            op: "add",
            value: {
              name: "AI Resume Parser",
              description:
                "A high-performance tool built with Rust to structure unstructured PDF data.",
              highlights: [
                "Implemented custom OCR pipeline",
                "Reduced parsing latency by 60%",
              ],
              keywords: ["Rust", "Wasm", "AI"],
              startDate: "2026-01-01",
            },
          },
        ],
      },
    };

    let mockResponse = responses.response2;
    // if (selectedNode?.path === "basics.summary") {
    //   mockResponse = responses.response2; // Summary rewrite
    // } else if (selectedNode?.path.includes("highlights")) {
    //   mockResponse = responses.response1; // Specific bullet point
    // } else if (selectedNode?.path === "work[1]") {
    //   mockResponse = responses.response3; // Whole job update
    // } else {
    //   mockResponse = responses.response4; // Default to skills
    // }

    // 3. Trigger the Aura Flow
    // This calls the AJV validation and sets the proposedChange state
    await handleAiUpdate(mockResponse);

    setIsGenerating(false);
    setAiOpen(false); // Close the command box to show the diff
  };
  // state to track what the AI is focusing on
  const [selectedNode, setSelectedNode] = useState<
    | {
        path: string;
        label: string;
        data: string;
        type: "block" | "highlight";
      }
    | null
    | undefined
  >(undefined);
  console.log("selectedNode", selectedNode);

  useEffect(() => {
    if (selectedNode && selectedNode.type === "highlight") {
      setAiOpen(true); // Automatically open the AI drawer when a bullet is clicked
    }
  }, [selectedNode]);

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <div
        className={`flex-1 overflow-auto px-4 py-4 md:max-w-3xl md:mx-auto md:px-6 md:py-5 w-full ${proposedPatches.length > 0 ? "pb-24" : ""}`}
      >
        <ResumeDocument
          resume={resume}
          onChange={handleChange}
          compact={mode === "preview"}
          readOnly={mode === "preview"}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          proposedPatches={proposedPatches}
        />
        {proposedPatches.length > 0 && (
          <ReviewBar
            patches={proposedPatches}
            onAcceptOne={commitOne}
            onAcceptAll={commitAll}
            onDiscardOne={discardOne}
            onDiscardAll={discardAll}
          />
        )}
      </div>
      {/* Floating buttons — bottom-right */}
      <div className="no-print fixed bottom-6 right-6 z-10 flex items-center gap-3">
        {mode === "preview" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-14 px-6 flex items-center gap-2 rounded-full 
                 bg-white text-slate-700 border border-slate-200/80
                 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-300
                 hover:shadow-[0_8px_20px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 
                 active:scale-95 group"
            title="In the print dialog, turn off 'Headers and footers' and choose 'Save as PDF'."
            aria-label="Download PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-slate-500 group-hover:text-slate-900 transition-colors"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden lg:block font-semibold text-sm tracking-tight text-slate-600 group-hover:text-slate-900">
              Download PDF
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          className="h-14 px-6 flex items-center gap-2 rounded-full 
               bg-slate-900 text-white shadow-lg shadow-slate-200/50 
               transition-all duration-300 hover:bg-black 
               hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
          title={mode === "edit" ? "Preview" : "Edit"}
          aria-label={mode === "edit" ? "Switch to preview" : "Switch to edit"}
        >
          {mode === "edit" ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 transition-transform duration-300 group-hover:rotate-12"
                aria-hidden
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="font-semibold text-sm tracking-tight hidden lg:block">
                Preview Mode
              </span>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 transition-transform duration-300"
                aria-hidden
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="font-semibold text-sm tracking-tight hidden lg:block">
                Back to Edit
              </span>
            </>
          )}
        </button>
      </div>

      {/* AI Assistant Button — moves up when ReviewBar is visible */}
      <div
        className={`no-print fixed lg:left-1/2 left-6 lg:-translate-x-1/2 z-40 transition-[bottom] duration-200 bottom-6`}
      >
        {!aiOpen && (
          <button
            onClick={() => {
              setAiOpen(true);
              setMode("preview");
            }}
            className="group relative h-14 px-8 flex items-center gap-3 rounded-full 
               bg-[#0f172a] text-white overflow-hidden transition-all duration-300
               hover:ring-2 hover:ring-slate-400 hover:ring-offset-2 hover:ring-offset-white"
          >
            {/* The "Ghost" Glow - moving behind the text */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500
                    bg-[radial-gradient(circle_at_var(--x,_50%)_var(--y,_50%),_rgba(255,255,255,0.15)_0%,_transparent_50%)]"
            />

            <Sparkles
              size={20}
              className="text-amber-300 transition-transform group-hover:rotate-12"
            />
            <span className="text-sm font-semibold tracking-tight">
              Ask Assistant
            </span>

            {/* Subtle bottom highlight */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </button>
        )}
      </div>
      <div className="no-print fixed lg:bottom-6 bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-200">
        {aiOpen && (
          <div
            className="flex flex-col gap-3 bg-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] 
                  rounded-2xl p-4 border border-slate-200/50 w-[440px] max-w-[95vw] 
                  animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center gap-2 px-1 text-slate-500">
              <Sparkles size={14} />
              <span className="text-[11px] uppercase tracking-widest font-bold">
                Resume Intelligence
              </span>
            </div>

            <textarea
              autoFocus
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Try: 'Make my bullet points more action-oriented'..."
              // className="w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent placeholder:text-slate-400 resize-none text-slate-800"
              disabled={isGenerating}
              className={`w-full text-[15px] leading-relaxed outline-none p-1 bg-transparent 
             placeholder:text-slate-400 resize-none text-slate-800 transition-opacity
             ${isGenerating ? "opacity-50" : "opacity-100"}`}
              rows={3}
            />

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                onClick={() => setAiOpen(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2"
              >
                Dismiss
              </button>
              <button
                disabled={isGenerating || isSuccess || !aiInput.trim()}
                onClick={handleGenerate}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-500 font-medium text-sm overflow-hidden min-w-[140px]
    ${isGenerating ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
    ${isSuccess ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : ""}
    ${!isGenerating && !isSuccess ? "bg-slate-900 text-white hover:bg-black active:scale-95 shadow-sm" : ""}
  `}
              >
                {/* Shimmer for Processing */}
                {isGenerating && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 to-transparent -translate-x-full animate-shimmer" />
                )}

                <div className="relative z-10 flex items-center gap-2">
                  {isSuccess ? (
                    <>
                      <Check
                        size={18}
                        className="animate-in zoom-in duration-300"
                      />
                      <span className="animate-in slide-in-from-bottom-1">
                        Updated
                      </span>
                    </>
                  ) : isGenerating ? (
                    <>
                      <span>Refining</span>
                      <div className="flex gap-1">
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
                      </div>
                    </>
                  ) : (
                    <>
                      {selectedNode ? (
                        <span>
                          Improve "{selectedNode.label.slice(0, 10)}..."
                        </span>
                      ) : (
                        <span>Generate</span>
                      )}
                      <Send
                        size={16}
                        className="opacity-70 group-hover:translate-x-1 transition-transform"
                      />
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

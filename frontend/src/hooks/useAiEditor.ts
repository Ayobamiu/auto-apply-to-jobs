import { useState } from "react";
import { cloneDeep, get, set } from "lodash";
import { Resume } from "../types/resume";
import { validateResumeFragment } from "../utils/ajv-setup";
import initialResume from "../sample-resume.json";
import { setResumePath } from "../resume-editor/utils";


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

export const useAiEditor = (initialResume: Resume, onSave: (next: any) => void) => {
    // const [resume, setResume] = useState<Resume>(initialResume);
    const [resume, setResume] = useState<Record<string, unknown>>(
        loadResumeFromStorage,
    );
    const [proposedChange, setProposedChange] = useState<any>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleAiUpdate = async (aiResponse: any) => {
        // 1. Extract path and proposed data from your demo JSON structure
        const { path, proposed } = aiResponse.results[0];

        // 2. Run the AJV Validation
        const { isValid, errors, sanitizedData } = validateResumeFragment(
            path,
            proposed,
        );

        if (!isValid) {
            console.error("AI Suggestion failed schema validation:", errors);
            // Optional: Trigger a toast notification to the user
            return;
        }

        // 3. Data is valid. Store it in a "Proposed" state for the Preview Phase.
        console.log("Validation successful for path:", path);

        setProposedChange({
            path,
            original: get(resume, path), // Get original data from current resume
            proposed: sanitizedData
        });

        // proceedToDiffing(path, sanitizedData);
    };

    // Inside your useAiEditor hook
    const commitChange = () => {

        // if (!proposedChange) return;

        // // Use your existing setResumePath utility to update the main state
        // const nextResume = setResumePath(resume, proposedChange.path, proposedChange.proposed);
        // // 1. Update local state
        // setResume(nextResume);
        // // 2. Persist to localStorage via the parent's handler
        // onSave(nextResume);
        // // 3. Cleanup
        // setProposedChange(null); // Clear the preview
        // setIsSuccess(true); // Trigger button success state
        // setTimeout(() => setIsSuccess(false), 2000);
        if (!proposedChange) return;

        const newResume = cloneDeep(resume);
        console.log("proposedChange", proposedChange);
        // proposedChange.results.forEach((change: any) => {
        if (proposedChange.action === 'insert') {
            // 1. Identify the array (e.g., 'volunteer')
            const arrayPath = proposedChange.path.replace(/\[\d+\]$/, '');
            const currentArray = get(newResume, arrayPath, []);

            // 2. Push the new object (Acme Inc) into the array
            (currentArray as any[]).push(proposedChange.proposed);
            set(newResume, arrayPath, currentArray);
        } else {
            // 3. Standard update for strings/existing objects
            set(newResume, proposedChange.path, proposedChange.proposed);
        }
        // });

        setResume(newResume); // Updates the main state
        onSave(newResume);
        setProposedChange(null); // Clears the "Aura" and ReviewBar
        setIsSuccess(true); // Trigger button success state
        setTimeout(() => setIsSuccess(false), 2000);
        //   saveToLocalStorage(newResume); // Persists to your local storage
    };

    const discardChange = () => {
        setProposedChange(null);
        // setAiInput(""); // Optional: Clear the input
    };
    return { resume, proposedChange, handleAiUpdate, setResume, commitChange, discardChange, isSuccess };
};
import { useState, useEffect, useCallback, useMemo } from "react";
import { getOnboardingStatus, OnboardingStatusResponse } from "../api";

const TASKS: { id: string; label: string; description: string; href: string; optional?: boolean }[] = [
    { id: "resume_uploaded", label: "Upload your resume", description: "We'll extract your profile automatically", href: "/settings/resume" },
    { id: "profile_complete", label: "Complete your profile", description: "Name, university, contact info", href: "/settings/profile" },
    { id: "transcript_uploaded", label: "Upload your transcript", description: "For jobs that require it", href: "/settings/transcript" },
    { id: "handshake_connected", label: "Connect Handshake", description: "Link your university account", href: "/settings/handshake", },
];

export function useOnboarding() {
    const [completion, setCompletion] = useState<OnboardingStatusResponse>({
        resume_uploaded: false,
        profile_complete: false,
        handshake_connected: false,
        transcript_uploaded: false,
    });

    const [loading, setLoading] = useState(true);
    useEffect(() => {

        async function fetchStatus() {
            try {
                const res = await getOnboardingStatus();
                setCompletion({
                    resume_uploaded: Boolean(res.resume_uploaded),
                    profile_complete: Boolean(res.profile_complete),
                    handshake_connected: Boolean(res.handshake_connected),
                    transcript_uploaded: Boolean(res.transcript_uploaded),
                });
            } catch (err) {
                console.error("Failed to fetch onboarding status", err);
            } finally {
                setLoading(false);
            }
        }
        fetchStatus();
    }, []);

    const { completedCount, totalCount, isComplete, progressPercent, nextTask } = useMemo(() => {
        const completedCount = Object.values(completion).filter(Boolean).length;
        const totalCount = TASKS.length;
        const isComplete = completedCount === totalCount;
        const progressPercent = Math.round((completedCount / totalCount) * 100);
        const nextTask = TASKS.find((t) => !completion[t.id as keyof typeof completion]) ?? null;
        return {
            completedCount,
            totalCount,
            isComplete,
            progressPercent,
            nextTask,
        }
    }, [completion])


    const markComplete = useCallback((taskId: keyof typeof completion) => {
        setCompletion((prev) => ({ ...prev, [taskId]: true }));
    }, []);


    return {
        tasks: TASKS.map((t) => ({ ...t, done: completion[t.id as keyof typeof completion] })),
        completedCount,
        totalCount,
        isComplete,
        progressPercent,
        nextTask,
        markComplete,
        loading,
        completion
    };
}
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  FileText,
  Send,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  X,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
} from "lucide-react";
import {
  getJobDetail,
  postPipeline,
  getPipelineArtifacts,
  postScrapeJobDetail,
  approvePipelineJob,
  cancelPipelineJob,
  saveJob,
  putApplicationFormAnswers,
  postApplicationFormReview,
  type JobDetailResponse,
  type PipelineArtifacts,
  type GeneratedAnswer,
} from "../api";
import { ResumeEditorApp } from "../resume-editor/ResumeEditorApp";
import { CoverLetterEditorApp } from "../resume-editor/CoverLetterEditorApp";
import { FormReviewPanel } from "./FormReviewPanel";
import { WrittenDocsReviewPanel } from "./WrittenDocsReviewPanel";
import dayjs from "dayjs";

type DocTab = "resume" | "cover" | "form" | "written-doc" | null;

export function DiscoverJobDetailPage() {
  const { jobRef: encodedRef } = useParams<{ jobRef: string }>();
  const navigate = useNavigate();
  const jobRef = encodedRef ? decodeURIComponent(encodedRef) : null;

  const [detail, setDetail] = useState<JobDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scrapingDetail, setScrapingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<PipelineArtifacts | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocTab>(null);
  const [mobileDocOpen, setMobileDocOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formSaved, setFormSaved] = useState(false);
  const [formAnswers, setFormAnswers] = useState<GeneratedAnswer[]>([]);

  /** Prevents overlapping silent pipeline polls (interval tick while prior GET still in flight). */
  const silentPollInFlightRef = useRef(false);

  const loadDetail = useCallback(async (ref: string, silent = false) => {
    if (silent && silentPollInFlightRef.current) {
      return;
    }
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    if (silent) silentPollInFlightRef.current = true;
    try {
      setDetail(await getJobDetail(ref));
    } catch (err) {
      if (!silent) {
        setDetailError(err instanceof Error ? err.message : "Failed to load");
        setDetail(null);
      }
    } finally {
      if (!silent) setDetailLoading(false);
      if (silent) silentPollInFlightRef.current = false;
    }
  }, []);

  const loadOrReloadArtifacts = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    setArtifactsLoading(true);
    try {
      setArtifacts(await getPipelineArtifacts(pid));
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Failed to load artifacts",
      );
    } finally {
      setArtifactsLoading(false);
    }
  }, [detail?.pipelineJob?.id]);

  useEffect(() => {
    loadOrReloadArtifacts();
  }, [detail?.pipelineJob?.id, loadOrReloadArtifacts]);

  const scrapeJobDetail = useCallback(async (ref: string) => {
    setScrapingDetail(true);
    try {
      const data = await postScrapeJobDetail(ref);
      setDetail((prev) => (prev ? { ...prev, job: data.job } : null));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to scrape");
    } finally {
      setScrapingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!jobRef) {
      navigate("/discover", { replace: true });
      return;
    }
    loadDetail(jobRef);
  }, [jobRef, loadDetail, navigate]);

  useEffect(() => {
    if (!jobRef || !detail?.job) return;
    if (!detail.job.description || !detail.job.applyType)
      scrapeJobDetail(jobRef);
  }, [
    jobRef,
    detail?.job?.description,
    detail?.job?.applyType,
    scrapeJobDetail,
  ]);

  const pipelineStatus = detail?.pipelineJob?.status;
  const isPipelineActive =
    pipelineStatus === "pending" || pipelineStatus === "running";
  useEffect(() => {
    if (!jobRef || !isPipelineActive) return;
    const id = setInterval(() => loadDetail(jobRef, true), 4000);
    return () => clearInterval(id);
  }, [jobRef, isPipelineActive, loadDetail]);

  const pipelineId = detail?.pipelineJob?.id;
  useEffect(() => {
    if (!pipelineStatus || !pipelineId) return;
    if (pipelineStatus !== "awaiting_approval" && pipelineStatus !== "done")
      return;
    void loadOrReloadArtifacts();
  }, [pipelineStatus, pipelineId, loadOrReloadArtifacts]);

  const hasArtifacts = !!(artifacts?.resume || artifacts?.cover);
  // Show Dynamic Form if there are items in the classifiedFields with intent not "upload_other_document"
  const hasDynamicForm =
    artifacts?.dynamicForm &&
    artifacts.dynamicForm.classifiedFields &&
    artifacts.dynamicForm.classifiedFields.some(
      (f) => f.fieldType !== "file_upload",
    );
  const hasWrittenDocument =
    !!artifacts?.writtenDocuments && artifacts.writtenDocuments.length > 0;

  useEffect(() => {
    if (artifacts?.dynamicForm?.answers) {
      setFormAnswers(artifacts.dynamicForm.answers);
    }
  }, [artifacts?.dynamicForm?.answers]);

  useEffect(() => {
    if (!hasArtifacts && !hasDynamicForm && !hasWrittenDocument) return;
    if (!activeDoc) {
      if (hasDynamicForm) setActiveDoc("form");
      else if (hasWrittenDocument) setActiveDoc("written-doc");
      else setActiveDoc(artifacts?.resume ? "resume" : "cover");
    }
  }, [
    hasArtifacts,
    hasDynamicForm,
    hasWrittenDocument,
    artifacts?.resume,
    artifacts?.cover,
    activeDoc,
  ]);

  useEffect(() => {
    if (detail?.userState?.lifecycleStatus === "saved") setSaved(true);
  }, [detail?.userState?.lifecycleStatus]);

  const handleRefresh = useCallback(() => {
    if (jobRef) loadDetail(jobRef);
  }, [jobRef, loadDetail]);

  const handleSave = useCallback(async () => {
    if (!jobRef || saving || saved) return;
    setSaving(true);
    try {
      await saveJob(jobRef);
      setSaved(true);
    } catch {
      /* silently ignore */
    } finally {
      setSaving(false);
    }
  }, [jobRef, saving, saved]);

  const handleApply = useCallback(
    async (url: string) => {
      setApplyingUrl(url);
      try {
        await postPipeline(url, { submit: true });
        if (jobRef) loadDetail(jobRef);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Failed");
      } finally {
        setApplyingUrl(null);
      }
    },
    [jobRef, loadDetail],
  );

  const handleGenerate = useCallback(
    async (url: string) => {
      setGeneratingUrl(url);
      try {
        await postPipeline(url, { submit: false });
        if (jobRef) loadDetail(jobRef);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Failed");
      } finally {
        setGeneratingUrl(null);
      }
    },
    [jobRef, loadDetail],
  );

  const handleApprove = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    try {
      if (hasDynamicForm && jobRef && formAnswers.length > 0) {
        await postApplicationFormReview(jobRef, formAnswers);
      }
      await approvePipelineJob(pid);
      if (jobRef) loadDetail(jobRef);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to approve");
    }
  }, [
    detail?.pipelineJob?.id,
    jobRef,
    loadDetail,
    hasDynamicForm,
    formAnswers,
  ]);

  const handleCancel = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    try {
      await cancelPipelineJob(pid);
      if (jobRef) loadDetail(jobRef);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to cancel");
    }
  }, [detail?.pipelineJob?.id, jobRef, loadDetail]);

  if (!jobRef) return null;

  const pipeline = detail?.pipelineJob;
  const appliedAt = !!detail?.userState?.appliedAt;
  const hasResume = !!detail?.hasResume;
  const showGenerate =
    !appliedAt &&
    !hasResume &&
    !(
      pipeline &&
      (pipeline.status === "awaiting_approval" || pipeline.status === "done")
    );
  const showApply =
    !appliedAt &&
    !(pipeline?.status === "failed" && pipeline?.retryAllowed === false);
  const cannotApply =
    pipeline?.status === "failed" &&
    pipeline?.retryAllowed === false &&
    !!detail?.job?.url;
  const jobDescription = detail?.job?.description ?? undefined;

  const handleFormSave = useCallback(async () => {
    if (!jobRef || formAnswers.length === 0 || formSaving) return;
    setFormSaving(true);
    setFormSaved(false);
    try {
      await putApplicationFormAnswers(jobRef, formAnswers);
      setFormSaved(true);
      setTimeout(() => setFormSaved(false), 1500);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Failed to save form answers",
      );
    } finally {
      setFormSaving(false);
    }
  }, [jobRef, formAnswers, formSaving]);

  const handleReviewAll = useCallback(() => {
    setFormAnswers((prev) =>
      prev.map((a) => {
        const hasValue = Array.isArray(a.value)
          ? a.value.length > 0
          : !!a.value;
        return hasValue ? { ...a, requiresReview: false } : a;
      }),
    );
  }, []);

  const renderDocEditor = () => {
    if (activeDoc === "written-doc") {
      return (
        <WrittenDocsReviewPanel
          writtenDocs={artifacts?.writtenDocuments ?? []}
          pipelineJobId={pipelineId ?? ""}
          pipelineJobStatus={pipelineStatus}
        />
      );
    }
    if (activeDoc === "form" && hasDynamicForm && artifacts?.dynamicForm) {
      const submitted = artifacts.dynamicForm.status === "submitted";
      const reviewCount = formAnswers.filter(
        (a) => a.requiresReview && a.value,
      ).length;
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Review prefilled form
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                These answers were auto-generated from your profile. Review and
                edit before submission.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!submitted && reviewCount > 0 && (
                <button
                  type="button"
                  onClick={handleReviewAll}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 cursor-pointer transition-colors"
                >
                  Review all
                </button>
              )}
              {!submitted && (
                <button
                  type="button"
                  onClick={handleFormSave}
                  disabled={formSaving || formAnswers.length === 0}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formSaving && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {formSaving ? "Saving…" : "Save changes"}
                </button>
              )}
              {formSaved && (
                <span className="text-xs text-green-700 inline-flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <FormReviewPanel
              fields={artifacts.dynamicForm.classifiedFields}
              answers={formAnswers}
              onChange={setFormAnswers}
              jobRef={jobRef ?? undefined}
              submitted={submitted}
              readOnly={submitted}
            />
          </div>
        </div>
      );
    }
    if (!artifacts || !pipelineId) return null;
    if (activeDoc === "resume" && artifacts.resume) {
      return (
        <ResumeEditorApp
          initialResume={artifacts.resume}
          jobId={pipelineId}
          jobDescription={jobDescription}
          onSave={(next) =>
            setArtifacts((prev) => (prev ? { ...prev, resume: next } : prev))
          }
          onBack={() => {
            setActiveDoc(null);
            setMobileDocOpen(false);
          }}
        />
      );
    }
    if (activeDoc === "cover" && artifacts.cover) {
      return (
        <CoverLetterEditorApp
          initialText={artifacts.cover.text}
          jobId={pipelineId}
          jobDescription={jobDescription}
          onSave={(t) =>
            setArtifacts((prev) =>
              prev ? { ...prev, cover: { text: t } } : prev,
            )
          }
          onBack={() => {
            setActiveDoc(null);
            setMobileDocOpen(false);
          }}
        />
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a document tab above to view
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)]">
      {/* ── Left sidebar ── */}
      <aside className="w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto bg-white">
        <div className="p-5 space-y-5">
          {/* Back link */}
          <Link
            to="/discover"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 no-underline transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to jobs
          </Link>

          {/* Loading skeleton */}
          {detailLoading && !detail && (
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-24 bg-gray-100 rounded mt-4" />
            </div>
          )}

          {/* Error */}
          {detailError && !detail && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4 space-y-3">
              <p className="text-sm text-red-700">{detailError}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                >
                  Try again
                </button>
                <Link
                  to="/discover"
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 no-underline"
                >
                  Back
                </Link>
              </div>
            </div>
          )}

          {detail && (
            <>
              {/* Job header */}
              <div className="flex items-start gap-3">
                {detail.job.companyLogoUrl ? (
                  <img
                    src={detail.job.companyLogoUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-contain flex-shrink-0 bg-gray-50 border border-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="text-[15px] font-semibold text-gray-900 leading-snug">
                    {detail.job.title || "Untitled"}
                  </h1>
                  {detail.job.company && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {detail.job.company}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
                    {detail.job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {detail.job.location}
                      </span>
                    )}
                    {detail.job.salaryEmploymentType && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {detail.job.salaryEmploymentType}
                      </span>
                    )}
                  </div>
                </div>
                {detail.job.url && (
                  <a
                    href={detail.job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="View on Handshake"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Applied badge */}
              {appliedAt && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm text-emerald-700 font-medium">
                    Applied{" "}
                    {detail.userState?.appliedAt
                      ? `· ${dayjs(detail.userState.appliedAt).format("MMMM D YYYY, h:mm:ss a")}`
                      : ""}
                  </span>
                </div>
              )}

              {/* ── Action card ── */}
              {!appliedAt && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                  {/* Save */}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || saved}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                      saved
                        ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                        : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-indigo-600"
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saved ? (
                      <BookmarkCheck className="w-4 h-4" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                    {saved ? "Saved" : "Save job"}
                  </button>

                  {/* Cannot apply notice */}
                  {cannotApply && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-800">
                        We can't apply to this job through the app.
                      </p>
                      <p className="text-xs text-amber-700">
                        You can still generate a tailored resume and cover
                        letter to use when applying manually.
                      </p>
                      {pipeline?.error && (
                        <p className="text-xs text-amber-600">
                          {pipeline.error}
                        </p>
                      )}
                      {detail.job.url && (
                        <button
                          type="button"
                          disabled={
                            !!generatingUrl || !!applyingUrl || isPipelineActive
                          }
                          onClick={() => handleGenerate(detail.job.url!)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed border-0 cursor-pointer"
                        >
                          {generatingUrl === detail.job.url ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          {generatingUrl === detail.job.url
                            ? "Generating…"
                            : "Generate documents"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Generate docs */}
                  {showGenerate && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        disabled={
                          !!generatingUrl || !!applyingUrl || isPipelineActive
                        }
                        onClick={() => {
                          if (!cannotApply && detail.job.url)
                            handleGenerate(detail.job.url);
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed border-0 cursor-pointer transition-colors"
                      >
                        {generatingUrl === detail.job.url ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                        {generatingUrl === detail.job.url
                          ? "Generating…"
                          : isPipelineActive
                            ? "Processing…"
                            : "Generate resume & cover letter"}
                      </button>
                      <p className="text-xs text-gray-400 text-center">
                        Tailored to this job description
                      </p>
                    </div>
                  )}

                  {/* Apply */}
                  {showApply && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        disabled={
                          !!applyingUrl || !!generatingUrl || isPipelineActive
                        }
                        onClick={() => {
                          if (!cannotApply && detail.job.url)
                            handleApply(detail.job.url);
                        }}
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-60 disabled:cursor-not-allowed border-0 cursor-pointer transition-colors ${
                          showGenerate
                            ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                            : "text-white bg-indigo-600 hover:bg-indigo-700"
                        }`}
                      >
                        {applyingUrl === detail.job.url ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {applyingUrl === detail.job.url
                          ? "Starting…"
                          : isPipelineActive
                            ? "Applying…"
                            : pipeline?.status === "failed"
                              ? "Re-apply"
                              : "Apply with Merit"}
                      </button>
                      <p className="text-xs text-gray-400 text-center">
                        Generates docs and submits on Handshake
                      </p>
                    </div>
                  )}

                  {/* Failed + retry allowed → also offer generate */}
                  {pipeline?.status === "failed" &&
                    pipeline?.retryAllowed !== false &&
                    !cannotApply &&
                    detail.job.url && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          disabled={
                            !!generatingUrl || !!applyingUrl || isPipelineActive
                          }
                          onClick={() => handleGenerate(detail.job.url!)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        >
                          {generatingUrl === detail.job.url ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          Generate resume and cover letter anyway
                        </button>
                        <p className="text-xs text-gray-400 text-center">
                          You can still create documents to use elsewhere.
                        </p>
                      </div>
                    )}
                </div>
              )}

              {/* Pipeline status */}
              {pipeline && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {isPipelineActive ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
                    ) : pipeline.status === "awaiting_approval" ? (
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : pipeline.status === "done" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : pipeline.status === "failed" ? (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : null}
                    <span className="text-sm font-medium text-gray-800 capitalize">
                      {pipeline.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {isPipelineActive && pipeline.phase && (
                    <p className="text-xs text-gray-500 pl-6">
                      {pipeline.phase}
                    </p>
                  )}
                  {pipeline.status === "done" && pipeline.userMessage && (
                    <p className="text-xs text-gray-600 pl-6">
                      {pipeline.userMessage}
                    </p>
                  )}
                  {pipeline.status === "failed" && (
                    <p className="text-xs text-red-600 pl-6">
                      {pipeline.error ?? "Application failed."}
                    </p>
                  )}

                  {/* Scraping indicator */}
                  {scrapingDetail && (
                    <p className="text-xs text-gray-400 inline-flex items-center gap-1.5 pl-6">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading job
                      details…
                    </p>
                  )}

                  {pipeline.status === "awaiting_approval" && (
                    <div className="flex gap-2 pt-1 pl-6">
                      <button
                        type="button"
                        onClick={handleApprove}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 border-0 cursor-pointer"
                      >
                        Approve & Submit
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Document tabs (sidebar) */}
              {(hasArtifacts || hasDynamicForm || hasWrittenDocument) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Documents
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {hasWrittenDocument && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDoc("written-doc");
                          setMobileDocOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                          activeDoc === "written-doc"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Written Document
                      </button>
                    )}
                    {hasDynamicForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDoc("form");
                          setMobileDocOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                          activeDoc === "form"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Application Form
                        {(() => {
                          const reviewCount = formAnswers.filter(
                            (a) => a.requiresReview && a.value,
                          ).length;
                          return reviewCount > 0 ? (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              {reviewCount}
                            </span>
                          ) : null;
                        })()}
                      </button>
                    )}
                    {artifacts?.resume && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDoc("resume");
                          setMobileDocOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                          activeDoc === "resume"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}
                    {artifacts?.cover && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDoc("cover");
                          setMobileDocOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                          activeDoc === "cover"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Cover Letter
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Loading artifacts */}
              {artifactsLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
                  documents…
                </div>
              )}

              {/* Job description */}
              {detail.job.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Job description
                  </p>
                  <div
                    className={`text-xs text-gray-600 whitespace-pre-wrap rounded-xl bg-gray-50 border border-gray-100 p-3 overflow-y-auto leading-relaxed ${
                      descriptionExpanded ? "" : "max-h-48"
                    }`}
                  >
                    {detail.job.description.slice(
                      0,
                      descriptionExpanded ? undefined : 5000,
                    )}
                  </div>
                  {detail.job.description.length > 300 && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 mt-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-transparent border-0 cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${descriptionExpanded ? "rotate-180" : ""}`}
                      />
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}

              {/* General error */}
              {detailError && (
                <p className="text-xs text-red-600">{detailError}</p>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Right panel: document editor (desktop) ── */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden bg-[#f8f9fb]">
        {(activeDoc === "form" && hasDynamicForm) ||
        (activeDoc === "written-doc" && hasWrittenDocument) ? (
          renderDocEditor()
        ) : activeDoc && artifacts && pipelineId ? (
          renderDocEditor()
        ) : (hasArtifacts || hasDynamicForm || hasWrittenDocument) &&
          !activeDoc ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <FileText className="w-12 h-12 opacity-20" />
            <p className="text-sm">
              Select a document from the sidebar to preview or edit
            </p>
          </div>
        ) : artifactsLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <FileText className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center max-w-xs">
              Your tailored resume and cover letter will appear here after
              generation.
            </p>
          </div>
        )}
      </div>

      {/* ── Mobile fullscreen doc modal ── */}
      {mobileDocOpen &&
        activeDoc &&
        ((artifacts && pipelineId) ||
          (activeDoc === "form" && hasDynamicForm) ||
          (activeDoc === "written-doc" && hasWrittenDocument)) && (
          <div className="fixed inset-0 z-50 bg-white lg:hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <span className="text-sm font-semibold text-gray-800 capitalize">
                {activeDoc === "cover"
                  ? "Cover Letter"
                  : activeDoc === "written-doc"
                    ? "Written Document"
                    : activeDoc === "form"
                      ? "Application Form"
                      : "Resume"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMobileDocOpen(false);
                  setActiveDoc(null);
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 bg-transparent border-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderDocEditor()}</div>
          </div>
        )}
    </div>
  );
}

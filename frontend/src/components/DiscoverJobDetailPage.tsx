import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MapPin, Briefcase, FileText, Send, ExternalLink,
  ClipboardList, CheckCircle, AlertCircle, Loader2, Clock, ChevronDown, ChevronRight, X,
} from "lucide-react";
import {
  getJobDetail, postPipeline, getPipelineArtifacts, postScrapeJobDetail,
  approvePipelineJob, cancelPipelineJob,
  type JobDetailResponse, type PipelineArtifacts,
} from "../api";
import { ResumeEditorApp } from "../resume-editor/ResumeEditorApp";
import { CoverLetterEditorApp } from "../resume-editor/CoverLetterEditorApp";

type DocTab = "resume" | "cover" | null;

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
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [activeDoc, setActiveDoc] = useState<DocTab>(null);
  const [mobileDocOpen, setMobileDocOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const loadDetail = useCallback(async (ref: string, silent = false) => {
    if (!silent) { setDetailLoading(true); setDetailError(null); }
    try { setDetail(await getJobDetail(ref)); }
    catch (err) { if (!silent) { setDetailError(err instanceof Error ? err.message : "Failed to load"); setDetail(null); } }
    finally { if (!silent) setDetailLoading(false); }
  }, []);

  const loadOrReloadArtifacts = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    setArtifactsLoading(true);
    try { setArtifacts(await getPipelineArtifacts(pid)); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed to load artifacts"); }
    finally { setArtifactsLoading(false); }
  }, [detail?.pipelineJob?.id]);

  useEffect(() => { loadOrReloadArtifacts(); }, [detail?.pipelineJob?.id, loadOrReloadArtifacts]);

  const scrapeJobDetail = useCallback(async (ref: string) => {
    setScrapingDetail(true);
    try { const data = await postScrapeJobDetail(ref); setDetail(prev => prev ? { ...prev, job: data.job } : null); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed to scrape"); }
    finally { setScrapingDetail(false); }
  }, []);

  useEffect(() => { if (!jobRef) { navigate("/discover", { replace: true }); return; } loadDetail(jobRef); }, [jobRef, loadDetail, navigate]);
  useEffect(() => { if (!jobRef || !detail?.job) return; if (!detail.job.description || !detail.job.applyType) scrapeJobDetail(jobRef); }, [jobRef, detail?.job?.description, detail?.job?.applyType, scrapeJobDetail]);

  const pipelineStatus = detail?.pipelineJob?.status;
  const isPipelineActive = pipelineStatus === "pending" || pipelineStatus === "running";
  useEffect(() => { if (!jobRef || !isPipelineActive) return; const id = setInterval(() => loadDetail(jobRef, true), 2500); return () => clearInterval(id); }, [jobRef, isPipelineActive, loadDetail]);

  const handleRefresh = useCallback(() => { if (jobRef) loadDetail(jobRef); }, [jobRef, loadDetail]);

  const handleApply = useCallback(async (url: string) => {
    setApplyingUrl(url);
    try { await postPipeline(url, { submit: true }); if (jobRef) loadDetail(jobRef); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed"); }
    finally { setApplyingUrl(null); }
  }, [jobRef, loadDetail]);

  const handleGenerate = useCallback(async (url: string) => {
    setGeneratingUrl(url);
    try { await postPipeline(url, { submit: false }); if (jobRef) loadDetail(jobRef); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed"); }
    finally { setGeneratingUrl(null); }
  }, [jobRef, loadDetail]);

  const handleApprove = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    try { await approvePipelineJob(pid); if (jobRef) loadDetail(jobRef); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed to approve"); }
  }, [detail?.pipelineJob?.id, jobRef, loadDetail]);

  const handleCancel = useCallback(async () => {
    const pid = detail?.pipelineJob?.id;
    if (!pid) return;
    try { await cancelPipelineJob(pid); if (jobRef) loadDetail(jobRef); }
    catch (err) { setDetailError(err instanceof Error ? err.message : "Failed to cancel"); }
  }, [detail?.pipelineJob?.id, jobRef, loadDetail]);

  const openDoc = (tab: DocTab) => { setActiveDoc(tab); setMobileDocOpen(true); };

  const pipeline = detail?.pipelineJob;
  const appliedAt = !!detail?.userState?.appliedAt;
  const hasResume = !!detail?.hasResume;
  const showGenerate = !appliedAt && !hasResume && !(pipeline && (pipeline.status === "awaiting_approval" || pipeline.status === "done"));
  const showApply = !appliedAt && !(pipeline?.status === "failed" && pipeline?.retryAllowed === false);
  const cannotApply = pipeline?.status === "failed" && pipeline?.retryAllowed === false && !!detail?.job?.url;
  const isPreviewOnly = appliedAt || (pipeline?.status === "failed" && pipeline?.retryAllowed === false);
  const hasArtifacts = !!(artifacts?.resume || artifacts?.cover);
  const jobDescription = detail?.job?.description ?? undefined;
  const pipelineId = detail?.pipelineJob?.id;

  if (!jobRef) return null;

  // Editor for the right panel / mobile modal
  const renderDocEditor = () => {
    if (!artifacts || !pipelineId) return null;
    if (activeDoc === "resume" && artifacts.resume) {
      return (
        <ResumeEditorApp
          initialResume={artifacts.resume}
          jobId={pipelineId}
          jobDescription={jobDescription}
          onSave={(next) => setArtifacts(prev => prev ? { ...prev, resume: next } : prev)}
          onBack={() => { setActiveDoc(null); setMobileDocOpen(false); }}
        />
      );
    }
    if (activeDoc === "cover" && artifacts.cover) {
      return (
        <CoverLetterEditorApp
          initialText={artifacts.cover.text}
          jobId={pipelineId}
          jobDescription={jobDescription}
          onSave={(t) => setArtifacts(prev => prev ? { ...prev, cover: { text: t } } : prev)}
          onBack={() => { setActiveDoc(null); setMobileDocOpen(false); }}
        />
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Select a document from the sidebar to view
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left panel: job info */}
      <div className="w-full lg:w-1/4 lg:border-r border-border overflow-y-auto">
        <div className="flex flex-col w-full max-w-3xl mx-auto">
          <header className="flex-shrink-0 border-b border-border px-4 py-3">
            <Link to="/discover" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-text bg-card border border-border rounded-lg no-underline hover:bg-input">
              <ArrowLeft className="w-4 h-4" /> Back to jobs
            </Link>
          </header>

          <main className="flex-1 p-4 md:p-6">
            {detailLoading && !detail ? (
              <div className="animate-pulse flex flex-col gap-4"><div className="h-8 bg-border rounded w-3/4" /><div className="h-5 bg-border rounded w-1/2" /><div className="h-4 bg-border rounded w-1/3 mt-4" /><div className="h-24 bg-border rounded mt-4" /></div>
            ) : detailError && !detail ? (
              <div className="flex flex-col items-center gap-4 p-8 rounded-xl border border-border bg-card">
                <p className="text-danger">{detailError}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleRefresh} className="px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border">Try again</button>
                  <Link to="/discover" className="px-4 py-2 text-sm font-medium text-text-muted bg-transparent border border-border rounded-lg hover:bg-input no-underline">Back to jobs</Link>
                </div>
              </div>
            ) : detail ? (
              <>
                {/* Job header */}
                <div className="flex gap-4 mb-6 items-center">
                  {detail.job.companyLogoUrl ? (
                    <img src={detail.job.companyLogoUrl} alt="" className="w-16 h-16 rounded-lg object-contain flex-shrink-0 bg-card border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0"><Briefcase className="w-8 h-8 text-text-muted" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl md:text-2xl font-semibold text-text mb-1">{detail.job.title || "Untitled"}</h1>
                    {detail.job.company && <p className="text-text-muted font-medium">{detail.job.company}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-text-muted">
                      {detail.job.location && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{detail.job.location}</span>}
                      {detail.job.salaryEmploymentType && <span className="inline-flex items-center gap-1"><Briefcase className="w-4 h-4" />{detail.job.salaryEmploymentType}</span>}
                    </div>
                  </div>
                  {detail.job.url && <a href={detail.job.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-6 h-6 text-accent" /></a>}
                </div>

                {/* Actions */}
                <section className="mb-6">
                  <div className="flex flex-col gap-4">
                    {cannotApply && (
                      <div className="rounded-xl p-4 bg-card border border-border">
                        <p className="text-sm text-text">We can&apos;t apply to this job through the app.{!hasResume && " Generate documents to use elsewhere?"}</p>
                        {pipeline?.error && <p className="text-sm text-text-muted mt-1">{pipeline.error}</p>}
                        {!hasResume && detail.job.url && (
                          <button type="button" disabled={!!generatingUrl || !!applyingUrl || isPipelineActive} onClick={() => handleGenerate(detail.job.url!)}
                            className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-70 disabled:cursor-not-allowed">
                            {generatingUrl === detail.job.url ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            {generatingUrl === detail.job.url ? "Generating…" : "Yes, generate"}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="w-full grid grid-cols-1 gap-4">
                      {showGenerate && (
                        <div className="w-full">
                          <button type="button" disabled={!!generatingUrl || !!applyingUrl || isPipelineActive}
                            onClick={() => { if (!cannotApply && detail.job.url) handleGenerate(detail.job.url); }}
                            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-70 disabled:cursor-not-allowed">
                            {generatingUrl === detail.job.url ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            {generatingUrl === detail.job.url ? "Generating…" : isPipelineActive ? "Processing…" : "Generate resume and other documents"}
                          </button>
                          <p className="text-xs text-text-muted mt-1.5">Creates a tailored resume and cover letter for this job.</p>
                        </div>
                      )}
                      {showApply && (
                        <div className="w-full">
                          <button type="button" disabled={!!applyingUrl || !!generatingUrl || isPipelineActive}
                            onClick={() => { if (!cannotApply && detail.job.url) handleApply(detail.job.url); }}
                            className="inline-flex items-center gap-2 w-full justify-center px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-70 disabled:cursor-not-allowed">
                            {applyingUrl === detail.job.url ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {applyingUrl === detail.job.url ? "Starting…" : isPipelineActive ? "Applying…" : pipeline?.status === "failed" ? "Re-apply" : "Apply"}
                          </button>
                          <p className="text-xs text-text-muted mt-1.5">Uses your saved documents or generates them first.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {scrapingDetail && (
                  <div className="flex flex-col items-center gap-4 p-8 rounded-xl border border-border bg-card">
                    <p className="text-sm text-text-muted inline-flex items-center gap-2">Scraping job detail… <Loader2 className="w-4 h-4 animate-spin" /></p>
                  </div>
                )}

                {/* Status section */}
                <section className="space-y-4">
                  {appliedAt && (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-text-muted inline-flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" /> Applied at {detail.userState!.appliedAt}
                      </p>
                    </div>
                  )}
                  {detail.hasResume && !appliedAt && <p className="text-sm text-text-muted">Resume on file</p>}

                  {pipeline && (
                    <div className="rounded-xl p-4 bg-card border border-border">
                      <h3 className="text-sm font-semibold text-text mb-2">Application status</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPipelineActive ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> :
                         pipeline.status === "awaiting_approval" ? <Clock className="w-4 h-4 text-accent" /> :
                         pipeline.status === "done" ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                         pipeline.status === "failed" ? <AlertCircle className="w-4 h-4 text-danger" /> : null}
                        <span className="text-sm text-text capitalize">{pipeline.status.replace(/_/g, " ")}</span>
                      </div>
                      {isPipelineActive && <p className="text-sm text-text-muted mt-1">{pipeline.phase ?? "Processing…"}</p>}
                      {pipeline.status === "done" && pipeline.userMessage && <p className="text-sm text-text mt-2">{pipeline.userMessage}</p>}
                      {pipeline.status === "failed" && <p className="text-sm text-danger mt-2">{pipeline.error ?? "Application failed."}</p>}

                      {/* Approve/Cancel for awaiting_approval */}
                      {pipeline.status === "awaiting_approval" && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={handleApprove} className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">Approve & Submit</button>
                          <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-text bg-input border border-border rounded-lg hover:bg-border">Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Documents collapsible */}
                {hasArtifacts && (
                  <section className="mt-6">
                    <button onClick={() => setDocsExpanded(e => !e)}
                      className="flex items-center gap-2 w-full text-left text-sm font-semibold text-text mb-2 hover:text-accent transition-colors">
                      {docsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {isPreviewOnly ? "Preview documents" : "Review generated documents"}
                    </button>
                    {docsExpanded && (
                      <div className="flex flex-col gap-2 pl-6">
                        {artifacts?.resume && (
                          <button onClick={() => openDoc("resume")}
                            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${activeDoc === "resume" ? "bg-accent/10 border-accent text-accent font-medium" : "bg-card border-border text-text hover:bg-input"}`}>
                            <FileText className="w-4 h-4" /> Resume
                          </button>
                        )}
                        {artifacts?.cover && (
                          <button onClick={() => openDoc("cover")}
                            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${activeDoc === "cover" ? "bg-accent/10 border-accent text-accent font-medium" : "bg-card border-border text-text hover:bg-input"}`}>
                            <ClipboardList className="w-4 h-4" /> Cover Letter
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Job description */}
                {detail.job.description && (
                  <section className="mt-6 mb-6">
                    <h2 className="text-sm font-semibold text-text mb-2">Description</h2>
                    <div className={`text-sm text-text whitespace-pre-wrap rounded-lg p-3 bg-card border border-border overflow-y-auto ${descriptionExpanded ? "" : "max-h-48"}`}>
                      {detail.job.description.slice(0, descriptionExpanded ? undefined : 5000)}
                    </div>
                    {detail.job.description.length > 5000 && (
                      <button type="button" onClick={() => setDescriptionExpanded(e => !e)} className="text-sm text-accent mt-2 hover:underline">
                        {descriptionExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </section>
                )}
              </>
            ) : null}
          </main>
        </div>
      </div>

      {/* Right panel: document viewer (desktop) */}
      <div className="hidden lg:block w-full lg:w-3/4 overflow-hidden">
        {activeDoc && artifacts && pipelineId ? (
          renderDocEditor()
        ) : hasArtifacts && !activeDoc ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a document from the sidebar to preview or edit</p>
            </div>
          </div>
        ) : artifactsLoading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
        ) : null}
      </div>

      {/* Mobile fullscreen modal */}
      {mobileDocOpen && activeDoc && artifacts && pipelineId && (
        <div className="fixed inset-0 z-50 bg-white lg:hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text capitalize">{activeDoc === "cover" ? "Cover Letter" : "Resume"}</span>
            <button onClick={() => { setMobileDocOpen(false); setActiveDoc(null); }} className="p-2 hover:bg-input rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-hidden">
            {renderDocEditor()}
          </div>
        </div>
      )}
    </div>
  );
}

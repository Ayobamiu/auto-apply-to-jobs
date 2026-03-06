import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBaseResume,
  postBaseResumeFile,
  postBaseResumeText,
  putBaseResume,
} from '../api';
import { createResumeForm } from '../resume-form';

interface BaseResumeModalProps {
  open: boolean;
  onClose: () => void;
}

export function BaseResumeModal({ open, onClose }: BaseResumeModalProps) {
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editError, setEditError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loadEditLoading, setLoadEditLoading] = useState(false);
  const [saveEditLoading, setSaveEditLoading] = useState(false);
  const [uploadPdfLoading, setUploadPdfLoading] = useState(false);
  const [saveTextLoading, setSaveTextLoading] = useState(false);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const resumeFormApiRef = useRef<ReturnType<typeof createResumeForm> | null>(null);
  const loadedResumeRef = useRef<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const clearMessages = useCallback(() => {
    setUploadMessage(null);
    setUploadError(false);
    setEditMessage(null);
    setEditError(false);
  }, []);

  useEffect(() => {
    if (!open) {
      clearMessages();
      setShowForm(false);
    }
  }, [open, clearMessages]);

  const handleLoadEdit = useCallback(async () => {
    setEditMessage(null);
    setEditError(false);
    setLoadEditLoading(true);
    try {
      const { resume } = await getBaseResume();
      loadedResumeRef.current = resume;
      setShowForm(true);
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : 'No base resume found. Upload or paste one first.');
      setEditError(true);
    } finally {
      setLoadEditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showForm || !formContainerRef.current || !loadedResumeRef.current) return;
    formContainerRef.current.innerHTML = '';
    resumeFormApiRef.current = createResumeForm(formContainerRef.current, loadedResumeRef.current);
    loadedResumeRef.current = null;
    return () => {
      resumeFormApiRef.current = null;
    };
  }, [showForm]);

  const handleSaveEdits = useCallback(async () => {
    const api = resumeFormApiRef.current;
    if (!api) return;
    const errMsg = api.validate();
    if (errMsg) {
      setEditMessage(errMsg);
      setEditError(true);
      return;
    }
    setEditError(false);
    setSaveEditLoading(true);
    try {
      await putBaseResume(api.getValue());
      setEditMessage('Edits saved.');
      setEditError(false);
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : 'Save failed.');
      setEditError(true);
    } finally {
      setSaveEditLoading(false);
    }
  }, []);

  const handleUploadPdf = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    fileInputRef.current && (fileInputRef.current.value = '');
    setUploadMessage(null);
    setUploadError(false);
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
      setUploadMessage('Please select a PDF file.');
      setUploadError(true);
      return;
    }
    setUploadPdfLoading(true);
    try {
      await postBaseResumeFile(file);
      setUploadMessage('Base resume saved from PDF.');
      setUploadError(false);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed.');
      setUploadError(true);
    } finally {
      setUploadPdfLoading(false);
    }
  }, []);

  const handleSaveFromText = useCallback(async () => {
    const text = pasteRef.current?.value?.trim() ?? '';
    setUploadMessage(null);
    setUploadError(false);
    if (!text) {
      setUploadMessage('Paste some resume text first.');
      setUploadError(true);
      return;
    }
    setSaveTextLoading(true);
    try {
      await postBaseResumeText(text);
      setUploadMessage('Base resume saved from text.');
      setUploadError(false);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Save failed.');
      setUploadError(true);
    } finally {
      setSaveTextLoading(false);
    }
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-xl max-w-[560px] w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-text">Base resume</h2>
          <button type="button" className="py-1.5 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border" onClick={onClose}>
            Close
          </button>
        </div>
        <div>
          <p className="text-text-muted text-[13px] mb-3">
            Upload a PDF or paste text to set your base resume. It will be tailored per job.
          </p>
          <div className="flex gap-2 items-center mb-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={() => {
                if (fileInputRef.current?.files?.[0]) handleUploadPdf();
              }}
            />
            <button
              type="button"
              className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPdfLoading}
            >
              Upload PDF
            </button>
          </div>
          <div className="flex gap-2 items-center mb-2.5">
            <textarea
              ref={pasteRef}
              className="review-textarea w-full mt-2 p-2.5 bg-input border border-border rounded-lg text-text text-[13px] font-mono resize-y"
              rows={6}
              placeholder="Or paste resume text here..."
            />
            <button
              type="button"
              className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
              onClick={handleSaveFromText}
              disabled={saveTextLoading}
            >
              Save from text
            </button>
          </div>
          {uploadMessage && (
            <div className={uploadError ? 'text-xs text-danger mt-1' : 'text-xs text-text-muted mt-1'}>
              {uploadMessage}
            </div>
          )}
        </div>
        <div className="mt-5 pt-4 border-t border-border">
          <button
            type="button"
            className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
            onClick={handleLoadEdit}
            disabled={loadEditLoading}
          >
            Load and edit
          </button>
          {showForm && (
            <button
              type="button"
              className="py-2 px-3.5 bg-input border border-border rounded-lg text-text text-[13px] cursor-pointer hover:bg-border"
              onClick={handleSaveEdits}
              disabled={saveEditLoading}
            >
              Save edits
            </button>
          )}
          {showForm && <div ref={formContainerRef} className="mt-3" />}
          {editMessage && (
            <div className={editError ? 'text-xs text-danger mt-1' : 'text-xs text-text-muted mt-1'}>
              {editMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

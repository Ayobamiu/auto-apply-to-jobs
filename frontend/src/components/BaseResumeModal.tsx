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
      className="base-resume-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="base-resume-modal-content">
        <div className="base-resume-modal-header">
          <h2>Base resume</h2>
          <button type="button" className="header-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="base-resume-upload">
          <p className="base-resume-hint">
            Upload a PDF or paste text to set your base resume. It will be tailored per job.
          </p>
          <div className="base-resume-upload-row">
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
              className="review-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPdfLoading}
            >
              Upload PDF
            </button>
          </div>
          <div className="base-resume-upload-row">
            <textarea
              ref={pasteRef}
              className="review-textarea"
              rows={6}
              placeholder="Or paste resume text here..."
            />
            <button
              type="button"
              className="review-btn"
              onClick={handleSaveFromText}
              disabled={saveTextLoading}
            >
              Save from text
            </button>
          </div>
          {uploadMessage && (
            <div className={`review-error${uploadError ? '' : ''}`} style={uploadError ? {} : { color: 'inherit' }}>
              {uploadMessage}
            </div>
          )}
        </div>
        <div className="base-resume-edit">
          <button
            type="button"
            className="review-btn"
            onClick={handleLoadEdit}
            disabled={loadEditLoading}
          >
            Load and edit
          </button>
          {showForm && (
            <button
              type="button"
              className="review-btn"
              onClick={handleSaveEdits}
              disabled={saveEditLoading}
            >
              Save edits
            </button>
          )}
          {showForm && <div ref={formContainerRef} className="base-resume-form-wrap" />}
          {editMessage && (
            <div className={`review-error${editError ? '' : ''}`} style={editError ? {} : { color: 'inherit' }}>
              {editMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

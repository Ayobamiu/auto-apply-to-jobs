import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ResumeEditorApp } from './resume-editor/ResumeEditorApp';
import './styles.css';

const appEl = document.getElementById('app');
if (!appEl) throw new Error('Missing #app');

const path = window.location.pathname;

if (path === '/resume-editor') {
  createRoot(appEl).render(<ResumeEditorApp standalone />);
} else {
  createRoot(appEl).render(<App />);
}

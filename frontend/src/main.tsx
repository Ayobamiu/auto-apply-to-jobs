import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const appEl = document.getElementById('app');
if (!appEl) throw new Error('Missing #app');
createRoot(appEl).render(<App />);

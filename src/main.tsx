import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Expose admin token to window in dev from Vite env for developer-only admin fallback
try {
  if (typeof window !== 'undefined') {
    (window as any).__ADMIN_TOKEN__ = (import.meta as any).env?.VITE_ADMIN_TOKEN || (window as any).__ADMIN_TOKEN__ || '';
  }
} catch (e) {
  // ignore in production or build-time environments
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

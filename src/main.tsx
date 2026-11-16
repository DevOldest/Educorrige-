import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const flagKey = 'educorrige_preload_reloaded';
      if (!window.sessionStorage?.getItem(flagKey)) {
        window.sessionStorage?.setItem(flagKey, '1');
        event.preventDefault();
        window.location.reload();
      }
    } catch {
      // Ignore sessionStorage/reload errors
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary title="Não foi possível iniciar o Educorrige">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

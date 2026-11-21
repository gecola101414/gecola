import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Auto-recovery sicuro in caso di chunk obsoleti subito dopo un nuovo deploy su Vercel
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const key = 'gecola_preload_reloaded';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
    }
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error || 'Errore imprevisto');
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('GeCoLa Runtime Error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <h1 className="text-lg font-bold text-amber-400">Si è verificato un errore durante il caricamento</h1>
            <p className="text-sm text-slate-300">
              Se hai appena aggiornato l&apos;applicazione, ricarica la pagina per scaricare i file aggiornati.
            </p>
            {this.state.errorMessage && (
              <pre className="text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 text-rose-300 overflow-x-auto whitespace-pre-wrap">
                {this.state.errorMessage}
              </pre>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('gecola_preload_reloaded');
                  } catch {}
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Ricarica GeCoLa
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
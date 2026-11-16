import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { clearAppLocalCache } from '../lib/safeStorage';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string | number;
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: ErrorBoundaryState;
  declare setState: (
    nextState:
      | Partial<ErrorBoundaryState>
      | ((prevState: Readonly<ErrorBoundaryState>) => Partial<ErrorBoundaryState> | null)
  ) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Erro inesperado ao renderizar esta tela.';
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturou uma falha de renderização:', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      this.handleRetry();
    }
  };

  handleClearCacheAndReload = (): void => {
    clearAppLocalCache();
    this.handleReload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-serif font-bold text-slate-900 dark:text-white">
              {this.props.title || 'Não foi possível carregar esta tela'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ocorreu uma falha temporária no navegador ou no cache local. Use uma das opções abaixo para recuperar o acesso imediatamente.
            </p>
          </div>

          {this.state.errorMessage && (
            <details className="text-left bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3 text-xs text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">
                Detalhes técnicos
              </summary>
              <p className="mt-2 font-mono break-words">{this.state.errorMessage}</p>
            </details>
          )}

          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="w-full py-3 px-4 rounded-2xl bg-brand-blue hover:bg-brand-blue-dark text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <RefreshCw size={16} />
              Tentar Novamente
            </button>

            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="w-full py-3 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-900 transition-colors"
            >
              <Trash2 size={15} />
              Limpar Cache Local e Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}

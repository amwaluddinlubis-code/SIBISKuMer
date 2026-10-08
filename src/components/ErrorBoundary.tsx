import { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/** Menangkap crash render pada satu panel agar seluruh aplikasi tidak blank. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): Partial<State> {
    return { hasError: true, message: err instanceof Error ? err.message : 'Terjadi kesalahan tampilan.' };
  }

  componentDidCatch(err: unknown): void {
    // Tetap log ke console untuk diagnosis, tanpa mengganggu pengguna.
    console.error('[ErrorBoundary]', err);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bg-white p-8 rounded-xl border border-rose-200 shadow-xs text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">{this.props.fallbackTitle || 'Panel gagal dimuat'}</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto break-words">
            {this.state.message || 'Terjadi kesalahan saat merender panel ini. Data Anda tetap aman.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

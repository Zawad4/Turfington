import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught an error:", error, errorInfo);
    // If a chunk load failed after a new Vercel deployment, automatically reload to fetch latest assets
    const msg = error?.message || '';
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('dynamically imported module') ||
      msg.includes('Loading chunk')
    ) {
      const now = Date.now();
      const last = sessionStorage.getItem('turfington_chunk_reload');
      if (!last || now - parseInt(last, 10) > 10000) {
        sessionStorage.setItem('turfington_chunk_reload', now.toString());
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    try {
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
    } catch (_) {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_r', Date.now().toString());
      window.location.href = url.toString();
    } catch (_) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080808] flex items-center justify-center p-6 text-center text-white">
          <div className="glass-card max-w-md p-8 border border-white/10 rounded-3xl space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto text-xl font-black">
              ⚠️
            </div>
            <h2 className="text-lg font-black font-display uppercase tracking-wider text-white">Something went wrong</h2>
            <p className="text-xs text-neutral-400 font-light">
              {this.state.error?.message || 'An unexpected display error occurred while updating active profile view.'}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              Reload & Recover Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

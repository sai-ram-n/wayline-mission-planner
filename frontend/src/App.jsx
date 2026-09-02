import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import ErrorBanner from './components/ui/ErrorBanner.jsx';
import Spinner from './components/ui/Spinner.jsx';
import Editor from './pages/Editor.jsx';
import Library from './pages/Library.jsx';
import Drones from './pages/Drones.jsx';
import useMissionStore from './store.js';

export default function App() {
  const loadMeta = useMissionStore((s) => s.loadMeta);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // The domain model (enums, labels, defaults) is served by the backend, so the
  // app waits for it once at startup rather than each page fetching its own copy.
  useEffect(() => {
    let cancelled = false;
    loadMeta()
      .then(() => !cancelled && setStatus('ready'))
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [loadMeta]);

  if (status !== 'ready') {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center p-8">
          {status === 'loading' ? (
            <Spinner label="Starting up…" />
          ) : (
            <div className="max-w-md">
              <ErrorBanner message={error} />
              <p className="mt-3 text-xs text-slate-500">
                Start the API with <code className="font-mono text-slate-400">npm run dev</code> in
                the <code className="font-mono text-slate-400">backend</code> folder, then reload.
              </p>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/editor" replace />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:id" element={<Editor />} />
        <Route path="/library" element={<Library />} />
        <Route path="/drones" element={<Drones />} />
        <Route path="*" element={<Navigate to="/editor" replace />} />
      </Routes>
    </AppShell>
  );
}

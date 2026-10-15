import { useEffect, useState } from 'react';

type ServerStatus = 'checking' | 'connected' | 'unreachable';

export function App() {
  const [status, setStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((response) => setStatus(response.ok ? 'connected' : 'unreachable'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unreachable');
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>webMCP-comparer</h1>
      <p>Compare a Baseline lane and a WebMCP lane on the same Scenario.</p>
      <p className="status">Server: {status}</p>
    </main>
  );
}

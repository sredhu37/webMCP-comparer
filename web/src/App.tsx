import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  api,
  type Defaults,
  type KeysInfo,
  type ModelsInfo,
  type Results,
  type RunListItem,
} from './api.ts';
import { Icon } from './components/Icon.tsx';
import { LiveSection } from './sections/LiveSection.tsx';
import { ResultsSection } from './sections/ResultsSection.tsx';
import { formFromResults, initialForm, setupReducer } from './setup/form.ts';
import { Setup } from './setup/Setup.tsx';
import { PastRuns } from './sidebar/PastRuns.tsx';

interface Boot {
  defaults: Defaults;
  models: ModelsInfo;
  keys: KeysInfo;
}

/** How often the Run list is read while a Run is going, to notice its end. */
const RUN_POLL_MS = 2000;
const SIDEBAR_KEY = 'webmcp-comparer:sidebar';

export function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.defaults(), api.models(), api.keys()]).then(
      ([defaults, models, keys]) => {
        if (!cancelled) setBoot({ defaults, models, keys });
      },
      (error: unknown) => {
        if (!cancelled) setBootError(errorText(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (boot) return <Workspace {...boot} />;
  return (
    <main className="boot">
      <h1>webMCP-comparer</h1>
      {bootError ? (
        <div className="notice error" role="alert">
          <Icon name="x" />
          <div>
            <p>The app server did not answer: {bootError}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setBootError(null);
                setAttempt((n) => n + 1);
              }}
            >
              <Icon name="retry" />
              Try again
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">Loading</p>
      )}
    </main>
  );
}

function Workspace({ defaults, models, keys: initialKeys }: Boot) {
  const [form, dispatch] = useReducer(setupReducer, defaults, initialForm);
  const [keys, setKeys] = useState(initialKeys);
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem(SIDEBAR_KEY) !== 'closed',
  );

  const syncRuns = useCallback(
    () =>
      api.runs().then(
        (list) => {
          setRuns(list.runs);
          setRunsError(null);
          setRunningId(list.running);
        },
        (error: unknown) => setRunsError(errorText(error)),
      ),
    [],
  );

  useEffect(() => {
    void syncRuns();
  }, [syncRuns]);

  useEffect(() => {
    if (!runningId) return;
    const timer = window.setInterval(() => void syncRuns(), RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [runningId, syncRuns]);

  // When the Run ends, show its results and pick up a key the server now keeps for the session.
  const previousRun = useRef<string | null>(null);
  useEffect(() => {
    const ended = previousRun.current;
    previousRun.current = runningId;
    if (!ended || ended === runningId) return;
    api.run(ended).then(setResults, (error: unknown) => setNotice(errorText(error)));
    api.keys().then(setKeys, () => undefined);
  }, [runningId]);

  function onStarted(id: string) {
    setResults(null);
    setNotice(null);
    setRunningId(id);
    void syncRuns();
    api.keys().then(setKeys, () => undefined);
  }

  function stop() {
    if (!runningId) return;
    setStoppingId(runningId);
    api.stopRun(runningId).catch((error: unknown) => {
      setStoppingId(null);
      setNotice(errorText(error));
    });
  }

  function open(id: string) {
    setNotice(null);
    api.run(id).then(
      (opened) => {
        dispatch({ type: 'load', form: formFromResults(opened, models) });
        setResults(opened);
      },
      (error: unknown) => setNotice(`Could not open Run ${id}: ${errorText(error)}`),
    );
  }

  function toggleSidebar() {
    const next = !sidebarOpen;
    window.localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed');
    setSidebarOpen(next);
  }

  return (
    <div className="shell">
      <PastRuns
        runs={runs}
        error={runsError}
        models={models}
        open={sidebarOpen}
        onToggle={toggleSidebar}
        onOpen={open}
        onRetry={() => void syncRuns()}
        openedId={results?.run.id ?? null}
        busy={runningId !== null}
      />
      <main className="main">
        <header className="top">
          <h1>webMCP-comparer</h1>
          <p>Same task, same site: Browser tools only, against Browser tools plus WebMCP tools.</p>
        </header>
        {notice && (
          <div className="notice error page-notice" role="alert">
            <Icon name="x" />
            <p>{notice}</p>
          </div>
        )}
        <Setup
          form={form}
          dispatch={dispatch}
          models={models}
          keys={keys}
          maxAttempts={defaults.maxAttempts}
          locked={runningId !== null}
          onStarted={onStarted}
        />
        <LiveSection
          runId={runningId}
          stopping={stoppingId !== null && stoppingId === runningId}
          onStop={stop}
        />
        <ResultsSection results={results} models={models} />
      </main>
    </div>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

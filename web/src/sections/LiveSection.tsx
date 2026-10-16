import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.tsx';
import { scrollToSection } from '../format.ts';

export interface LiveSectionProps {
  /** The Run that is going, or null. */
  runId: string | null;
  stopping: boolean;
  onStop: () => void;
}

/**
 * The Live section. This holds the Run header and Stop Run; the Lane screens, Step meters,
 * scoreboard and tool-call logs (#28) render inside `live-body`.
 */
export function LiveSection({ runId, stopping, onStop }: LiveSectionProps) {
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (runId) scrollToSection(section.current);
  }, [runId]);

  if (!runId) return null;
  return (
    <section className="section" aria-labelledby="live-title" id="live" ref={section}>
      <header className="section-head">
        <h2 id="live-title">Live</h2>
        <span className="section-meta num">Run {runId}</span>
        <span className="pill running">{stopping ? 'Stopping' : 'Running'}</span>
      </header>
      <div className="live-body" />
      <div className="actions">
        <button type="button" className="button danger" onClick={onStop} disabled={stopping}>
          <Icon name="stop" />
          Stop Run
        </button>
      </div>
    </section>
  );
}

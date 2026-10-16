import { useEffect, useRef } from 'react';
import { LANES, type LaneId, type ModelsInfo, type Results } from '../api.ts';
import { formatRunDate, scrollToSection, siteLabel } from '../format.ts';

export interface ResultsSectionProps {
  results: Results | null;
  models: ModelsInfo;
}

const LANE_NAMES: Record<LaneId, string> = { baseline: 'Baseline', webmcp: 'WebMCP' };

/**
 * The Results section: the Lane legend and pass counts of the Run in view. The paired metric
 * bars and the Scenario rows (#28) render inside `results-body`.
 */
export function ResultsSection({ results, models }: ResultsSectionProps) {
  const section = useRef<HTMLElement>(null);
  const id = results?.run.id ?? null;

  useEffect(() => {
    if (id) scrollToSection(section.current);
  }, [id]);

  if (!results) return null;
  const { run, summary } = results;
  const model = models.models.find((option) => option.id === run.model);
  return (
    <section className="section" aria-labelledby="results-title" id="results" ref={section}>
      <header className="section-head">
        <h2 id="results-title">Results</h2>
        <span className="section-meta">
          {formatRunDate(run.startedAt)}, {siteLabel(run.siteUrl)}, {model?.name ?? run.model}
        </span>
      </header>
      <div className="summary-head">
        {LANES.map((lane) => {
          const { pass, fail } = summary[lane];
          const total = pass + fail;
          return (
            <span key={lane} className="lane-count">
              <span className="swatch" data-lane={lane} aria-hidden="true" />
              {LANE_NAMES[lane]} passed{' '}
              <span className="num">
                {pass}/{total}
              </span>
            </span>
          );
        })}
        {run.stoppedByUser && <span className="pill neutral">Stopped by user</span>}
        {run.error && <span className="pill fail">{run.error}</span>}
      </div>
      <div className="results-body" />
    </section>
  );
}

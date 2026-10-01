import { ChevronRight, FileText, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type TrainingStoryTone = 'info' | 'success' | 'warning' | 'blocked' | 'muted';

export type TrainingStoryEvent = {
  id: string;
  title: string;
  from: string;
  to: string;
  document: string;
  status: string;
  tone: TrainingStoryTone;
  summary: string;
  explanation?: string;
  logLines: readonly string[];
  testId?: string;
};

export function TrainingStoryTimeline({
  identifier,
  events,
  scenarioTitle,
  scenarioBody,
  guidance,
  testId,
  viewerTestId = 'training-story-log-viewer',
  onInspect,
  children,
}: {
  identifier: string;
  events: readonly TrainingStoryEvent[];
  scenarioTitle: string;
  scenarioBody: string;
  guidance?: string;
  testId: string;
  viewerTestId?: string;
  onInspect?: (event: TrainingStoryEvent) => void;
  children?: ReactNode;
}) {
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const openEvent = events.find((event) => event.id === openEventId) ?? null;

  function inspect(event: TrainingStoryEvent) {
    onInspect?.(event);
    setOpenEventId(event.id);
  }

  return (
    <div className="training-story-console" data-testid={testId}>
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Integration timeline</span><strong>{identifier}</strong></div>
          <small>Follow the story top to bottom. Click a record to inspect its server evidence.</small>
        </div>

        <div className="training-story-context">
          <div className="training-story-context-icon"><FileText size={18} /></div>
          <div>
            <span>Scenario</span>
            <strong>{scenarioTitle}</strong>
            <p>{scenarioBody}</p>
            {guidance && <small>{guidance}</small>}
          </div>
        </div>

        <div className="replay-story-list">
          {events.map((event, index) => (
            <button
              key={event.id}
              className={'replay-story-row ' + event.tone}
              type="button"
              onClick={() => inspect(event)}
              data-testid={event.testId ?? 'training-story-event-' + event.id}
            >
              <span className="replay-story-rail" aria-hidden="true">
                <span className="replay-story-number">{index + 1}</span>
              </span>
              <span className="replay-story-main">
                <span className="replay-story-route">
                  <strong>{event.from}</strong>
                  <span>→</span>
                  <strong>{event.to}</strong>
                </span>
                <span className="replay-story-title">{event.title}</span>
                <span className="replay-story-document">{event.document}</span>
              </span>
              <span className={'replay-story-status ' + event.tone}>{event.status}</span>
              <ChevronRight className="replay-story-open" size={17} aria-hidden="true" />
            </button>
          ))}
        </div>

        {children}
      </section>

      {openEvent && (
        <div className="replay-log-backdrop" role="presentation" onClick={() => setOpenEventId(null)}>
          <section
            className={'replay-log-modal ' + openEvent.tone}
            role="dialog"
            aria-modal="true"
            aria-labelledby={testId + '-log-title'}
            onClick={(event) => event.stopPropagation()}
            data-testid={viewerTestId}
          >
            <header className="replay-log-header">
              <div>
                <span>{openEvent.document}</span>
                <h3 id={testId + '-log-title'}>{openEvent.title}</h3>
              </div>
              <button type="button" onClick={() => setOpenEventId(null)} aria-label="Close log">
                <X size={19} />
              </button>
            </header>

            <div className="replay-log-route">
              <span>{openEvent.from}</span>
              <ChevronRight size={16} />
              <span>{openEvent.to}</span>
              <strong className={'replay-story-status ' + openEvent.tone}>{openEvent.status}</strong>
            </div>

            <div className="replay-log-summary">
              <strong>What the analyst sees</strong>
              <p>{openEvent.summary}</p>
            </div>

            <div className="replay-log-terminal">
              <div className="replay-log-terminal-bar">
                <span>freightbridge-training.log</span>
                <small>read-only evidence</small>
              </div>
              <pre><code>{openEvent.logLines.join('\n')}</code></pre>
            </div>

            {openEvent.explanation && (
              <div className="replay-log-explanation">
                <strong>Why this record matters</strong>
                <p>{openEvent.explanation}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

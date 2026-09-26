import { CheckCircle2, Circle, Lock, MessageSquare, NotebookPen, RotateCcw, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type {
  CheckpointStatus,
  HealthyCheckpoint,
  HealthyChecklistItem,
  Hint,
  KnowledgeCheckQuestion,
  MissionCommunication,
  MissionPhase,
  TrainingEntity,
  TrainingEvidence,
} from '../../training/types';

export function MissionBriefing({ children }: { children: ReactNode }) {
  return (
    <article className="training-hero">
      {children}
    </article>
  );
}

export function CharacterMessage({
  name,
  role,
  children,
}: {
  name: string;
  role: string;
  children: ReactNode;
}) {
  return (
    <article className="character-message">
      <div className="character-avatar" aria-hidden="true">
        <MessageSquare size={22} />
      </div>
      <div>
        <p className="eyebrow">{role}</p>
        <h2>{name}</h2>
        <div>{children}</div>
      </div>
    </article>
  );
}

export function EntityCard({ entity }: { entity: TrainingEntity }) {
  const Icon = entity.icon;
  return (
    <article className={`entity-card ${entity.perspective}`} data-testid={entity.testId}>
      <div className="entity-icon" aria-hidden="true">
        <Icon size={24} />
      </div>
      <p className="eyebrow">{entity.role}</p>
      <h3>{entity.name}</h3>
      <p>{entity.explanation}</p>
      <small>{entity.communication}</small>
    </article>
  );
}

export function CommunicationMessage({ message }: { message: MissionCommunication }) {
  return (
    <article className={`character-message ${message.kind === 'partner' ? 'partner-message' : ''}`}>
      <div className="character-avatar" aria-hidden="true">
        <MessageSquare size={22} />
      </div>
      <div>
        <p className="eyebrow">{message.role}</p>
        <h2>{message.from}</h2>
        <p>{message.body}</p>
      </div>
    </article>
  );
}

export function MissionPhaseProgress({
  phases,
  current,
}: {
  phases: MissionPhase[];
  current: MissionPhase;
}) {
  const currentIndex = phases.indexOf(current);
  return (
    <ol className="mission-phase-progress" aria-label="Mission phases">
      {phases.map((phase, index) => (
        <li
          key={phase}
          className={index < currentIndex ? 'complete' : index === currentIndex ? 'current' : ''}
          aria-current={phase === current ? 'step' : undefined}
        >
          <span>{phase.toLowerCase()}</span>
        </li>
      ))}
    </ol>
  );
}

export function EvidencePanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="evidence-panel" open={defaultOpen}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function EvidenceCard({ evidence }: { evidence: TrainingEvidence }) {
  return (
    <article className="evidence-card" data-testid={`evidence-${evidence.id}`}>
      <div className="evidence-card-header">
        <div>
          <p className="eyebrow">{evidence.type}</p>
          <h3>{evidence.summary}</h3>
        </div>
        <span>{evidence.source}</span>
      </div>
      <div className="observed-meaning-grid">
        <div>
          <h4>Observed by FreightBridge</h4>
          <p>{evidence.observed}</p>
        </div>
        <div>
          <h4>What this means</h4>
          <p>{evidence.meaning}</p>
        </div>
      </div>
      {(evidence.timestamp || evidence.businessIdentifier) && (
        <dl className="definition-grid evidence-meta">
          {evidence.timestamp && <div><dt>Timestamp</dt><dd>{evidence.timestamp}</dd></div>}
          {evidence.businessIdentifier && <div><dt>Business ID</dt><dd>{evidence.businessIdentifier}</dd></div>}
        </dl>
      )}
      {evidence.raw !== undefined && (
        <EvidencePanel title="Inspect Raw Data">
          <pre className="lab-preview">{renderRawEvidence(evidence.raw)}</pre>
        </EvidencePanel>
      )}
    </article>
  );
}

export type CheckpointView = {
  checkpoint: HealthyCheckpoint;
  status: CheckpointStatus;
  rawEvidence?: unknown;
  values?: Record<string, string | number | null | undefined>;
};

export function FollowThisLoad({
  loadId,
  labRunId,
  currentStage,
  currentResult,
}: {
  loadId?: string;
  labRunId?: string;
  currentStage: string;
  currentResult: string;
}) {
  return (
    <article className="panel follow-load-panel" data-testid="follow-this-load">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Following Load</p>
          <h2>{loadId ?? 'Start the mission to create a training load'}</h2>
        </div>
      </div>
      <dl className="definition-grid">
        <div><dt>Apex</dt><dd>Apex Logistics</dd></div>
        <div><dt>Carrier</dt><dd>Midwest Carrier</dd></div>
        <div><dt>Current Stage</dt><dd>{currentStage}</dd></div>
        <div><dt>Current Result</dt><dd>{currentResult}</dd></div>
        {labRunId && <div><dt>Lab Run ID</dt><dd>{labRunId}</dd></div>}
      </dl>
    </article>
  );
}

export function CheckpointTimeline({ checkpoints }: { checkpoints: CheckpointView[] }) {
  return (
    <ol className="checkpoint-timeline" aria-label="Healthy integration checkpoints">
      {checkpoints.map(({ checkpoint, status }) => (
        <li key={checkpoint.id} className={`checkpoint-status ${status.toLowerCase()}`}>
          <span className="checkpoint-number">{checkpoint.sequence}</span>
          <div>
            <strong>{checkpoint.shortLabel}</strong>
            <small>{status === 'COMPLETE' ? 'Complete' : status === 'CURRENT' ? 'Current' : 'Pending'}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function MissionCheckpoint({
  view,
  children,
}: {
  view: CheckpointView;
  children?: ReactNode;
}) {
  const { checkpoint, status, rawEvidence, values } = view;
  const isAvailable = status !== 'PENDING';

  return (
    <article className={`panel mission-checkpoint ${status.toLowerCase()}`} data-testid={`mission-checkpoint-${checkpoint.id}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Checkpoint {checkpoint.sequence} - {status === 'COMPLETE' ? 'Complete' : status === 'CURRENT' ? 'Current' : 'Pending'}</p>
          <h2>{checkpoint.title}</h2>
        </div>
      </div>
      {!isAvailable ? (
        <p className="muted-text">Evidence for this checkpoint has not appeared yet. Continue the real Lab run to unlock it.</p>
      ) : (
        <>
          <div className="checkpoint-learning-grid">
            <div>
              <h3>Observed by FreightBridge</h3>
              <p>{checkpoint.observed}</p>
            </div>
            <div>
              <h3>Why it matters</h3>
              <p>{checkpoint.whyItMatters}</p>
            </div>
            <div>
              <h3>What I should check</h3>
              <ul className="check-list">
                {checkpoint.analystChecks.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3>Healthy signal</h3>
              <p>{checkpoint.healthySignal}</p>
            </div>
          </div>
          <div className="correlation-strip" aria-label={`${checkpoint.title} correlation identifiers`}>
            {checkpoint.correlationFields.map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
          {values && (
            <dl className="definition-grid checkpoint-values">
              {Object.entries(values).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value ?? 'Pending'}</dd></div>
              ))}
            </dl>
          )}
          {checkpoint.technicalDetails && (
            <EvidencePanel title="Technical details">
              <p>{checkpoint.technicalDetails}</p>
            </EvidencePanel>
          )}
          {rawEvidence !== undefined && (
            <EvidencePanel title={checkpoint.rawEvidenceTitle ?? 'Inspect Raw Data'}>
              <pre className="lab-preview">{renderRawEvidence(rawEvidence)}</pre>
            </EvidencePanel>
          )}
          {children}
        </>
      )}
    </article>
  );
}

export function TechnicalComparison() {
  return (
    <article className="panel technical-comparison" data-testid="transport-business-comparison">
      <div className="panel-header">
        <h2>Transport vs Business Outcome</h2>
      </div>
      <div className="comparison-grid">
        <div>
          <strong>SFTP upload success</strong>
          <p>FreightBridge delivered a file. It does not prove the carrier accepted the load.</p>
        </div>
        <div>
          <strong>997 technical acknowledgment</strong>
          <p>Midwest received and structurally processed the EDI. It still does not mean "yes."</p>
        </div>
        <div>
          <strong>990 business response</strong>
          <p>This is the carrier's tender decision: accepted or rejected.</p>
        </div>
      </div>
    </article>
  );
}

export function HealthyFlowChecklist({
  items,
}: {
  items: HealthyChecklistItem[];
}) {
  return (
    <article className="panel healthy-checklist" data-testid="healthy-flow-checklist">
      <div className="panel-header">
        <h2>Healthy Integration Checklist</h2>
      </div>
      <ul className="healthy-checklist-list">
        {items.map((item) => (
          <li key={item.id}>
            <CheckCircle2 size={18} />
            <div>
              <strong>{item.label}</strong>
              <span>{item.evidence}</span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function LastHealthyCheckpoint({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  return (
    <article className="panel last-healthy-checkpoint" data-testid="last-healthy-checkpoint">
      <div className="panel-header">
        <h2>Last Healthy Checkpoint</h2>
      </div>
      <p><strong>{label}</strong></p>
      <p>{explanation}</p>
    </article>
  );
}

export function FinalHealthyReview({
  items,
  selected,
  onToggle,
  reviewed,
}: {
  items: HealthyChecklistItem[];
  selected: string[];
  onToggle: (id: string) => void;
  reviewed: boolean;
}) {
  return (
    <article className="panel final-review" data-testid="final-healthy-review">
      <div className="panel-header">
        <h2>Final Analyst Review</h2>
      </div>
      <p className="muted-text">Based on the evidence, select every statement that proves this was a healthy flow.</p>
      <div className="review-options">
        {items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => onToggle(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      {reviewed && (
        <div className="knowledge-feedback correct">
          <CheckCircle2 size={18} />
          <p>Review complete. These are the healthy signals you should compare against future incidents.</p>
        </div>
      )}
    </article>
  );
}

export function HintPanel({ hints }: { hints: Hint[] }) {
  return (
    <article className="panel hint-panel" data-testid="hint-panel">
      <div className="panel-header">
        <h2>Hints</h2>
      </div>
      <div className="hint-list">
        {hints.map((hint, index) => (
          <details key={hint.id}>
            <summary>{hint.label}</summary>
            <p>{hint.body}</p>
            <small>Hint {index + 1} of {hints.length}</small>
          </details>
        ))}
      </div>
    </article>
  );
}

export function AnalystNotes({ storageKey }: { storageKey: string }) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(window.localStorage.getItem(storageKey) ?? '');
  }, [storageKey]);

  function updateNotes(value: string) {
    setNotes(value);
    window.localStorage.setItem(storageKey, value);
  }

  return (
    <article className="panel analyst-notes" data-testid="analyst-notes">
      <div className="panel-header">
        <h2>Analyst Notes</h2>
        <NotebookPen size={19} />
      </div>
      <label>
        Notes for this mission
        <textarea
          value={notes}
          onChange={(event) => updateNotes(event.target.value)}
          placeholder="Write down the signals you would expect to see in a healthy shipment."
        />
      </label>
      <p className="muted-text">Stored locally in this browser. Notes are not sent to FreightBridge.</p>
    </article>
  );
}

export function ReplayButton({ onReplay, disabled }: { onReplay: () => void; disabled?: boolean }) {
  return (
    <button className="secondary-button" type="button" onClick={onReplay} disabled={disabled} data-testid="replay-mission">
      <RotateCcw size={16} />
      Replay Mission
    </button>
  );
}

export function MissionObjective({
  done,
  children,
}: {
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mission-objective ${done ? 'done' : ''}`}>
      {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      <span>{children}</span>
    </div>
  );
}

export function MissionProgress({ completed, total }: { completed: number; total: number }) {
  const width = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="mission-progress" aria-label={`${completed} of ${total} mission objectives complete`}>
      <div className="mission-progress-label">
        <span>Mission progress</span>
        <strong>{completed} / {total}</strong>
      </div>
      <div className="mission-progress-track">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function KnowledgeCheck({
  question,
  selected,
  onAnswer,
}: {
  question: KnowledgeCheckQuestion;
  selected: string | null;
  onAnswer: (optionId: string) => void;
}) {
  const answered = selected !== null;
  const correct = selected === question.correctOptionId;

  return (
    <article className="knowledge-check">
      <h3>{question.prompt}</h3>
      <div className="knowledge-options" role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option) => (
          <button
            key={option.id}
            className={selected === option.id ? 'selected' : ''}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            onClick={() => onAnswer(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {answered && (
        <div className={`knowledge-feedback ${correct ? 'correct' : 'incorrect'}`}>
          {correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <p>{correct ? question.explanation : `Not quite. ${question.explanation}`}</p>
        </div>
      )}
    </article>
  );
}

export function LockedMarker({ unlocked = false }: { unlocked?: boolean }) {
  return (
    <span className={`locked-marker ${unlocked ? 'unlocked' : ''}`}>
      <Lock size={14} />
      {unlocked ? 'Locked · Coming soon' : 'Locked'}
    </span>
  );
}

function renderRawEvidence(value: unknown): string {
  if (value === null || value === undefined) return 'Evidence pending.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

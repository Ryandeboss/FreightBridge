import { CheckCircle2, Circle, Lock, MessageSquare, NotebookPen, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Hint, KnowledgeCheckQuestion, MissionCommunication, MissionPhase, TrainingEntity, TrainingEvidence } from '../../training/types';

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
          placeholder="Write what you observed, what it means, and what you would check next."
        />
      </label>
      <p className="muted-text">Stored locally in this browser. Notes are not sent to FreightBridge.</p>
    </article>
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
      {unlocked ? 'Coming soon' : 'Locked'}
    </span>
  );
}

function renderRawEvidence(value: unknown): string {
  if (value === null || value === undefined) return 'Evidence pending.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

import { CheckCircle2, Circle, Lock, MessageSquare, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { KnowledgeCheckQuestion, TrainingEntity } from '../../training/types';

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
    <article className="entity-card">
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

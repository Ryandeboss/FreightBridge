import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  CopyCheck,
  History,
  Play,
  Repeat2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  completeReplaySequencePractice,
  isReplaySequencePracticeComplete,
} from '../training/advancedPractice';
import { SFTP_STOPS_WORKING_MISSION_ID } from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

const checks = [
  {
    id: 'duplicate',
    prompt: 'A second Apex request uses the same load ID but no idempotency key. What is it?',
    answer: 'Duplicate business attempt',
    options: ['Safe replay', 'Duplicate business attempt', 'Out-of-order event'],
  },
  {
    id: 'replay',
    prompt: 'The same 214 bytes and X12 controls arrive again after the original succeeded. What should FreightBridge do?',
    answer: 'Record the replay and skip business side effects',
    options: ['Create another shipment event', 'Record the replay and skip business side effects', 'Treat it as a new load'],
  },
  {
    id: 'sequence',
    prompt: 'ARRIVED is received after DELIVERED, but ARRIVED occurred earlier. What should current status remain?',
    answer: 'DELIVERED',
    options: ['ARRIVED', 'DELIVERED', 'Whichever message arrived last'],
  },
] as const;

export function ReplaySequencePracticePage() {
  const progress = loadTrainingProgress();
  const unlocked = hasCompletedMission(progress, SFTP_STOPS_WORKING_MISSION_ID);
  const { token, handleApiError } = useOperationsSession();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(isReplaySequencePracticeComplete());

  const completedSteps = run?.steps.filter((step) => step.status === 'SUCCEEDED').length ?? 0;
  const nextStep = run?.steps.find((step) => step.status !== 'SUCCEEDED') ?? null;
  const checksPassed = checks.every((check) => answers[check.id] === check.answer);

  const deliveredEvidence = useMemo(() => stepResponse(run, 'FREIGHTBRIDGE_RECEIVE_214_DELIVERED'), [run]);
  const replayEvidence = useMemo(() => stepResponse(run, 'FREIGHTBRIDGE_RECEIVE_214_REPLAY'), [run]);
  const sequenceEvidence = useMemo(() => stepResponse(run, 'FREIGHTBRIDGE_RECEIVE_214_LATE_ARRIVED'), [run]);

  const canComplete = Boolean(
    run?.status === 'SUCCEEDED'
    && replayEvidence?.businessSideEffectsSkipped === true
    && replayEvidence?.replayOfTransactionId
    && sequenceEvidence?.currentStatusPreserved === true
    && sequenceEvidence?.currentStatus === 'DELIVERED'
    && checksPassed
  );

  if (!unlocked) return <Navigate to="/learn" replace />;

  async function startPractice() {
    if (!token) return;
    setWorking(true);
    setError(null);
    try {
      const created = await createLabRun(token, {
        scenarioKey: 'REPLAY_SEQUENCE_PRACTICE',
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Replay Sequence Training Freight',
      });
      setRun(created);
      setComplete(false);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Replay and sequence practice could not be started.');
    } finally {
      setWorking(false);
    }
  }

  async function runNext() {
    if (!token || !run || !nextStep) return;
    setWorking(true);
    setError(null);
    try {
      const result = await runNextLabStep(token, run.id);
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The next practice step failed.');
    } finally {
      setWorking(false);
    }
  }

  function finish() {
    if (!canComplete) return;
    completeReplaySequencePractice();
    setComplete(true);
  }

  return (
    <section className="replay-sequence-page" data-testid="replay-sequence-practice-page">
      <Link className="secondary-button training-back-link" to="/learn"><ArrowLeft size={16} />Ops Desk</Link>

      <header className="healthy-guide-header">
        <div>
          <p className="eyebrow">Milestone 38 · Advanced Practice</p>
          <h1>Duplicate, replay, and event sequence are three different problems</h1>
          <p>Use one real FreightBridge Lab run to prove what gets suppressed, what stays auditable, and why receive order does not control shipment chronology.</p>
        </div>
        <div className="healthy-guide-boundary">
          <span>Final-shift prep</span>
          <strong>{complete ? 'Complete' : 'In progress'}</strong>
          <small>Mission 10 remains separate.</small>
        </div>
      </header>

      <section className="replay-concept-grid" data-testid="replay-concept-grid">
        <article><AlertTriangle size={20} /><h2>Duplicate business attempt</h2><p>Same business shipment submitted again without safe retry semantics. FreightBridge blocks duplicate business creation.</p></article>
        <article><Repeat2 size={20} /><h2>Exact replay</h2><p>Same X12 controls and identical bytes arrive again. FreightBridge records replay linkage and skips duplicate side effects.</p></article>
        <article><History size={20} /><h2>Late event</h2><p>A new event arrives later but occurred earlier. FreightBridge stores the history while preserving the newer current status.</p></article>
      </section>

      <article className="panel replay-practice-run">
        <div className="panel-header">
          <div><p className="eyebrow">Live Lab</p><h2>Run the evidence sequence</h2></div>
          <span className="badge badge-info">{completedSteps} / {run?.steps.length ?? 13} steps</span>
        </div>
        {!run ? (
          <button className="primary-button" type="button" onClick={startPractice} disabled={working}>
            <Play size={16} />Start Advanced Practice
          </button>
        ) : (
          <>
            <div className="replay-step-strip">
              {run.steps.map((step) => (
                <span className={step.status === 'SUCCEEDED' ? 'complete' : nextStep?.stepKey === step.stepKey ? 'active' : ''} key={step.stepKey}>
                  {step.status === 'SUCCEEDED' ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                  {step.displayName}
                </span>
              ))}
            </div>
            {nextStep && (
              <button className="primary-button" type="button" onClick={runNext} disabled={working}>
                <Play size={16} />Run Next Step
              </button>
            )}
          </>
        )}
        {error && <div className="knowledge-feedback incorrect"><AlertTriangle size={17} /><p>{error}</p></div>}
      </article>

      <section className="replay-evidence-grid">
        <EvidenceCard
          title="1. Original DELIVERED event"
          ready={Boolean(deliveredEvidence)}
          body="The first DELIVERED 214 is processed normally and becomes shipment-status evidence."
          rows={[
            ['Transaction', nested(deliveredEvidence, 'targetProcessed', 'transactionId')],
            ['Archived file', nested(deliveredEvidence, 'targetProcessed', 'destinationPath')],
          ]}
        />
        <EvidenceCard
          title="2. Exact X12 replay"
          ready={Boolean(replayEvidence)}
          body="The archived bytes are requeued unchanged. Replay linkage must exist and Apex event count must not increase."
          rows={[
            ['Replay status', value(replayEvidence?.status)],
            ['Replay of', value(replayEvidence?.replayOfTransactionId)],
            ['Side effects skipped', yesNo(replayEvidence?.businessSideEffectsSkipped)],
            ['Apex events before / after', replayEvidence ? value(replayEvidence.apexEventCountBefore) + ' / ' + value(replayEvidence.apexEventCountAfter) : 'Pending'],
          ]}
        />
        <EvidenceCard
          title="3. Late ARRIVED event"
          ready={Boolean(sequenceEvidence)}
          body="ARRIVED is received after DELIVERED but has an older business-event timestamp. It is retained without regressing current status."
          rows={[
            ['Late event stored', yesNo(sequenceEvidence?.lateEventStored)],
            ['Current status preserved', yesNo(sequenceEvidence?.currentStatusPreserved)],
            ['Current status', value(sequenceEvidence?.currentStatus)],
            ['Late occurred / delivered occurred', sequenceEvidence ? value(sequenceEvidence.lateEventOccurredAt) + ' / ' + value(sequenceEvidence.deliveredOccurredAt) : 'Pending'],
          ]}
        />
      </section>

      <article className="panel healthy-checks" data-testid="replay-sequence-checks">
        <div className="panel-header"><div><p className="eyebrow">Classification check</p><h2>Name the behavior before choosing the response</h2></div></div>
        <div className="mapping-check-grid">
          {checks.map((check) => (
            <fieldset className="knowledge-check" key={check.id}>
              <legend>{check.prompt}</legend>
              <div className="knowledge-options">
                {check.options.map((option) => (
                  <button
                    className={answers[check.id] === option ? 'selected' : ''}
                    key={option}
                    type="button"
                    onClick={() => setAnswers((current) => ({ ...current, [check.id]: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {answers[check.id] && (
                <div className={'knowledge-feedback ' + (answers[check.id] === check.answer ? 'correct' : 'incorrect')}>
                  {answers[check.id] === check.answer ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <p>{answers[check.id] === check.answer ? 'Correct.' : 'Recheck the evidence boundary before classifying it.'}</p>
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </article>

      <article className={'panel healthy-finish ' + (complete ? 'complete' : '')} data-testid="replay-sequence-completion">
        <div>
          <p className="eyebrow">Advanced practice completion</p>
          <h2>Ready for the final shift</h2>
          <p>You proved duplicate protection, exact replay suppression, and event-time sequencing using FreightBridge evidence.</p>
        </div>
        {!complete ? (
          <button className="primary-button" type="button" onClick={finish} disabled={!canComplete}><CopyCheck size={16} />Complete Advanced Practice</button>
        ) : (
          <div className="healthy-next"><CheckCircle2 size={18} /><span><strong>Advanced practice complete.</strong><small>Mission 10 remains reserved for the final production-style shift.</small></span></div>
        )}
      </article>
    </section>
  );
}

function EvidenceCard({ title, ready, body, rows }: { title: string; ready: boolean; body: string; rows: [string, string][] }) {
  return (
    <article className={'panel replay-evidence-card ' + (ready ? 'complete' : '')}>
      <div className="panel-header"><h2>{title}</h2>{ready ? <CheckCircle2 size={20} /> : <Circle size={20} />}</div>
      <p>{body}</p>
      <dl className="definition-grid compact-definitions">
        {rows.map(([label, rowValue]) => <div key={label}><dt>{label}</dt><dd>{rowValue}</dd></div>)}
      </dl>
    </article>
  );
}

function stepResponse(run: LabRun | null, stepKey: string): Record<string, unknown> | null {
  return run?.steps.find((step) => step.stepKey === stepKey)?.responseSummary ?? null;
}

function nested(record: Record<string, unknown> | null, parent: string, child: string): string {
  if (!record) return 'Pending';
  const parentValue = record[parent];
  if (!parentValue || typeof parentValue !== 'object') return 'Pending';
  return value((parentValue as Record<string, unknown>)[child]);
}

function yesNo(valueToCheck: unknown): string {
  if (valueToCheck === true) return 'YES';
  if (valueToCheck === false) return 'NO';
  return 'Pending';
}

function value(valueToFormat: unknown): string {
  return valueToFormat === null || valueToFormat === undefined || valueToFormat === '' ? 'Pending' : String(valueToFormat);
}

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileCode2,
  History,
  Play,
  Repeat2,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import {
  completeReplaySequencePractice,
  isReplaySequencePracticeComplete,
} from '../training/advancedPractice';
import { SFTP_STOPS_WORKING_MISSION_ID } from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

type PolicyDraft = {
  duplicateBusiness: string;
  exactReplay: string;
  currentStatus: string;
};

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

const correctPolicy: PolicyDraft = {
  duplicateBusiness: 'BLOCK_DUPLICATE_BUSINESS',
  exactReplay: 'RECORD_AND_SKIP_SIDE_EFFECTS',
  currentStatus: 'LATEST_OCCURRED_AT',
};

export function ReplaySequencePracticePage() {
  const progress = loadTrainingProgress();
  const unlocked = hasCompletedMission(progress, SFTP_STOPS_WORKING_MISSION_ID);
  const { token, handleApiError } = useOperationsSession();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<PolicyDraft>({
    duplicateBusiness: 'CREATE_NEW_BUSINESS',
    exactReplay: 'REPROCESS_SIDE_EFFECTS',
    currentStatus: 'LAST_RECEIVED_MESSAGE',
  });
  const [activeFile, setActiveFile] = useState('policy');
  const [complete, setComplete] = useState(isReplaySequencePracticeComplete());

  const nextStep = run?.steps.find((step) => step.status !== 'SUCCEEDED') ?? null;
  const checksPassed = checks.every((check) => answers[check.id] === check.answer);
  const policyCorrect = Object.entries(correctPolicy).every(([key, value]) => policy[key as keyof PolicyDraft] === value);
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
    && policyCorrect
  );

  if (!unlocked) return <Navigate to="/learn/desk" replace />;

  async function startPractice() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setAnswers({});
    setPolicy({
      duplicateBusiness: 'CREATE_NEW_BUSINESS',
      exactReplay: 'REPROCESS_SIDE_EFFECTS',
      currentStatus: 'LAST_RECEIVED_MESSAGE',
    });
    setComplete(false);
    try {
      const created = await createLabRun(token, {
        scenarioKey: 'REPLAY_SEQUENCE_PRACTICE',
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Replay Sequence Training Freight',
      });
      setRun(created);
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

  if (!run) {
    return (
      <section className="workstation-case-start" data-testid="replay-sequence-practice-page">
        <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Training Desk</Link>
        <article className="panel workstation-case-brief">
          <div>
            <p className="eyebrow">Module 05 · Advanced policy clinic</p>
            <h1>Duplicate, replay, and event sequence are three different problems.</h1>
            <p>Run one real FreightBridge practice sequence, then configure the policy that should prevent duplicate side effects and current-status regression.</p>
          </div>
          <div className="advanced-concept-strip" data-testid="replay-concept-grid">
            <span><AlertTriangle size={16} /><strong>Duplicate business attempt</strong><small>Same shipment submitted again without safe retry semantics.</small></span>
            <span><Repeat2 size={16} /><strong>Exact replay</strong><small>Same X12 controls and identical bytes arrive again.</small></span>
            <span><History size={16} /><strong>Late event</strong><small>Received later, but occurred earlier than the current event.</small></span>
          </div>
          <button className="primary-button" type="button" onClick={startPractice} disabled={working}>
            <Play size={16} />{working ? 'Starting practice…' : complete ? 'Replay Advanced Practice' : 'Start Advanced Practice'}
          </button>
        </article>
        {error && <PracticeError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="replay-sequence-practice-page">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Training Desk</Link>
      {error && <PracticeError message={error} />}

      <LabWorkstation
        caseLabel="Module 05 · Advanced policy clinic"
        title="Replay, duplicate, and chronology policy"
        subtitle="Observe the real sequence, configure the correct policy, then prove you can classify each behavior."
        statusLabel={canComplete ? 'Policy verified' : run.status === 'SUCCEEDED' ? 'Configure policy' : 'Evidence running'}
        statusTone={canComplete ? 'success' : 'neutral'}
        console={
          <ReplayConsole
            run={run}
            nextStep={nextStep}
            working={working}
            deliveredEvidence={deliveredEvidence}
            replayEvidence={replayEvidence}
            sequenceEvidence={sequenceEvidence}
            onRunNext={runNext}
          />
        }
        code={
          <ReplayCode
            activeFile={activeFile}
            policy={policy}
            policyCorrect={policyCorrect}
            onActiveFile={setActiveFile}
            onPolicy={setPolicy}
          />
        }
        answer={
          <ReplayAnswer
            answers={answers}
            checksPassed={checksPassed}
            policyCorrect={policyCorrect}
            canComplete={canComplete}
            complete={complete}
            onAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
            onComplete={finish}
          />
        }
      />

      {complete && (
        <article className="panel workstation-complete" data-testid="replay-sequence-completion">
          <CheckCircle2 size={24} />
          <div>
            <p className="eyebrow">Advanced practice complete</p>
            <h2>Ready for independent investigation.</h2>
            <p>You proved duplicate protection, exact replay suppression, and event-time chronology using the same workstation model.</p>
          </div>
          <Link className="primary-button" to="/learn/desk">Return to Training Desk <ArrowLeft size={16} /></Link>
        </article>
      )}
    </section>
  );
}

function ReplayConsole({
  run,
  nextStep,
  working,
  deliveredEvidence,
  replayEvidence,
  sequenceEvidence,
  onRunNext,
}: {
  run: LabRun;
  nextStep: LabRun['steps'][number] | null;
  working: boolean;
  deliveredEvidence: Record<string, unknown> | null;
  replayEvidence: Record<string, unknown> | null;
  sequenceEvidence: Record<string, unknown> | null;
  onRunNext: () => void;
}) {
  const completed = run.steps.filter((step) => step.status === 'SUCCEEDED').length;
  return (
    <div className="replay-workstation-console" data-testid="replay-workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Practice execution log</span><strong>{run.businessIdentifier}</strong></div>
          <small>{completed} / {run.steps.length} steps observed</small>
        </div>
        <div className="workstation-log-list">
          {run.steps.map((step, index) => (
            <div className={'workstation-log-row ' + step.status.toLowerCase()} key={step.stepKey}>
              <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="workstation-log-icon">{step.status === 'SUCCEEDED' ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span>
              <span className="workstation-log-copy"><strong>{step.displayName}</strong><small>{step.transport} · {step.documentType}</small></span>
              <span className="workstation-log-status">{step.status}</span>
            </div>
          ))}
        </div>
        {nextStep ? (
          <div className="healthy-console-runner">
            <div><Play size={17} /><span><strong>Run the next real practice checkpoint.</strong> Watch how FreightBridge handles the original event, exact replay, and late event.</span></div>
            <button className="primary-button" type="button" onClick={onRunNext} disabled={working}>
              {working ? 'Running…' : 'Run Next Step'} <Play size={15} />
            </button>
          </div>
        ) : (
          <div className="healthy-console-runner complete"><CheckCircle2 size={18} /><span><strong>Evidence sequence complete.</strong> Configure the policy in Code.</span></div>
        )}
      </section>

      <aside className="replay-evidence-stack">
        <EvidenceCard
          title="Original DELIVERED"
          ready={Boolean(deliveredEvidence)}
          rows={[
            ['Transaction', nested(deliveredEvidence, 'targetProcessed', 'transactionId')],
            ['Archived file', nested(deliveredEvidence, 'targetProcessed', 'destinationPath')],
          ]}
        />
        <EvidenceCard
          title="Exact X12 replay"
          ready={Boolean(replayEvidence)}
          rows={[
            ['Replay status', value(replayEvidence?.status)],
            ['Replay of', value(replayEvidence?.replayOfTransactionId)],
            ['Side effects skipped', yesNo(replayEvidence?.businessSideEffectsSkipped)],
            ['Apex events before / after', replayEvidence ? value(replayEvidence.apexEventCountBefore) + ' / ' + value(replayEvidence.apexEventCountAfter) : 'Pending'],
          ]}
        />
        <EvidenceCard
          title="Late ARRIVED event"
          ready={Boolean(sequenceEvidence)}
          rows={[
            ['Late event stored', yesNo(sequenceEvidence?.lateEventStored)],
            ['Current status preserved', yesNo(sequenceEvidence?.currentStatusPreserved)],
            ['Current status', value(sequenceEvidence?.currentStatus)],
          ]}
        />
      </aside>
    </div>
  );
}

function ReplayCode({
  activeFile,
  policy,
  policyCorrect,
  onActiveFile,
  onPolicy,
}: {
  activeFile: string;
  policy: PolicyDraft;
  policyCorrect: boolean;
  onActiveFile: (file: string) => void;
  onPolicy: (policy: PolicyDraft) => void;
}) {
  const files = [
    { id: 'reference', path: 'Reference/replay_sequence_rules.md' },
    { id: 'policy', path: 'Fix/integration_policy.training.json' },
  ];
  const referenceText = [
    'Duplicate business attempt',
    '  -> do not create a second shipment',
    '',
    'Exact X12 replay',
    '  -> keep replay/audit evidence',
    '  -> skip duplicate business side effects',
    '',
    'Late event',
    '  -> store valid history',
    '  -> current status follows latest business event time (occurred_at), not receive order',
  ].join('\n');

  return (
    <div className="workstation-code advanced-workstation-code" data-testid="replay-workstation-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading"><div><span>Workspace</span><strong>Replay & chronology policy</strong></div></div>
        <div className="workstation-file-list">
          {files.map((file) => (
            <button key={file.id} className={activeFile === file.id ? 'active' : ''} type="button" onClick={() => onActiveFile(file.id)}>
              <FileCode2 size={14} /><span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="workstation-editor">
        <div className="workstation-editor-bar"><span>{files.find((file) => file.id === activeFile)?.path}</span><small>{activeFile === 'policy' ? 'Editable training policy' : 'Read only'}</small></div>
        {activeFile === 'reference' ? (
          <pre data-testid="replay-code-content"><code>{referenceText}</code></pre>
        ) : (
          <div className="advanced-edit-form" data-testid="replay-policy-editor">
            <label>
              <span>Duplicate business request</span>
              <select value={policy.duplicateBusiness} onChange={(event) => onPolicy({ ...policy, duplicateBusiness: event.target.value })}>
                <option value="CREATE_NEW_BUSINESS">Create a new shipment again</option>
                <option value="BLOCK_DUPLICATE_BUSINESS">Block duplicate business creation</option>
              </select>
            </label>
            <label>
              <span>Exact X12 replay</span>
              <select value={policy.exactReplay} onChange={(event) => onPolicy({ ...policy, exactReplay: event.target.value })}>
                <option value="REPROCESS_SIDE_EFFECTS">Process business side effects again</option>
                <option value="RECORD_AND_SKIP_SIDE_EFFECTS">Record replay and skip duplicate side effects</option>
              </select>
            </label>
            <label>
              <span>Current shipment status rule</span>
              <select value={policy.currentStatus} onChange={(event) => onPolicy({ ...policy, currentStatus: event.target.value })}>
                <option value="LAST_RECEIVED_MESSAGE">Whichever message arrived last</option>
                <option value="LATEST_OCCURRED_AT">Latest business event time (occurred_at)</option>
              </select>
            </label>
            <pre><code>{JSON.stringify(policy, null, 2)}</code></pre>
            <div className={'advanced-edit-status ' + (policyCorrect ? 'ready' : '')}>
              {policyCorrect ? 'Policy matches the safe FreightBridge behavior.' : 'One or more policy choices would create duplicate or regressive business effects.'}
            </div>
          </div>
        )}
      </section>
      <aside className="workstation-code-note">
        <Server size={19} />
        <strong>Advanced rule</strong>
        <p>Transport receipt order is not the same thing as business chronology, and auditability does not require replaying business side effects.</p>
      </aside>
    </div>
  );
}

function ReplayAnswer({
  answers,
  checksPassed,
  policyCorrect,
  canComplete,
  complete,
  onAnswer,
  onComplete,
}: {
  answers: Record<string, string>;
  checksPassed: boolean;
  policyCorrect: boolean;
  canComplete: boolean;
  complete: boolean;
  onAnswer: (id: string, value: string) => void;
  onComplete: () => void;
}) {
  return (
    <div className="workstation-answer advanced-workstation-answer" data-testid="replay-sequence-checks">
      <div className="workstation-answer-intro">
        <span>Classification check</span>
        <h2>Name the behavior and prove the policy matches it.</h2>
        <p>The real evidence comes from Console. The policy you configured in Code determines whether FreightBridge creates duplicate effects or protects chronology.</p>
      </div>
      {checks.map((check) => (
        <fieldset className="workstation-options" key={check.id}>
          <legend>{check.prompt}</legend>
          {check.options.map((option) => (
            <label key={option} className={answers[check.id] === option ? 'selected' : ''}>
              <input
                type="radio"
                name={'replay-' + check.id}
                value={option}
                checked={answers[check.id] === option}
                onChange={() => onAnswer(check.id, option)}
              />
              <span>{option}</span>
            </label>
          ))}
          {answers[check.id] && (
            <div className={'workstation-option-feedback ' + (answers[check.id] === check.answer ? 'correct' : 'incorrect')}>
              {answers[check.id] === check.answer ? 'Correct.' : 'Recheck the Console evidence and policy meaning.'}
            </div>
          )}
        </fieldset>
      ))}
      <div className={'advanced-fix-readiness ' + (policyCorrect ? 'ready' : '')}>
        <FileCode2 size={18} />
        <div><strong>{policyCorrect ? 'Policy configured correctly' : 'Policy still unsafe'}</strong><p>Duplicate handling, replay suppression, and current-status chronology must all be correct.</p></div>
      </div>
      <button className="primary-button" type="button" onClick={onComplete} disabled={!canComplete || complete}>
        <CheckCircle2 size={16} />{complete ? 'Advanced Practice Complete' : 'Complete Advanced Practice'}
      </button>
      {!checksPassed && <small>Answer all three classifications correctly.</small>}
    </div>
  );
}

function EvidenceCard({ title, ready, rows }: { title: string; ready: boolean; rows: [string, string][] }) {
  return (
    <article className={'replay-workstation-evidence ' + (ready ? 'complete' : '')}>
      <div><strong>{title}</strong>{ready ? <CheckCircle2 size={17} /> : <Circle size={17} />}</div>
      <dl>{rows.map(([label, rowValue]) => <div key={label}><dt>{label}</dt><dd>{rowValue}</dd></div>)}</dl>
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

function PracticeError({ message }: { message: string }) {
  return <div className="knowledge-feedback incorrect"><AlertTriangle size={17} /><p>{message}</p></div>;
}

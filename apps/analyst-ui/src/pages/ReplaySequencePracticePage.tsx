import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode2,
  History,
  Play,
  Repeat2,
  Server,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
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

const evidenceLogRows = [
  {
    time: '14:02:11.204',
    status: 'BLOCKED',
    title: 'Apex repeated LOAD LABREPLAY900 without retry identity',
    detail: 'Business key already exists. FreightBridge classifies this as a duplicate business attempt and does not create a second shipment.',
  },
  {
    time: '14:03:09.881',
    status: 'ACCEPTED',
    title: 'Original Midwest 214 DELIVERED accepted',
    detail: 'AT7=D1 · ST02=1080 · occurred_at=14:00:00Z. Shipment history is appended and current status advances to DELIVERED.',
  },
  {
    time: '14:03:14.126',
    status: 'ARCHIVED',
    title: 'Original transaction committed',
    detail: 'transaction=TX-214-1080 · payload_sha256=9f1c…e7a4 · Apex shipment event count=1.',
  },
  {
    time: '14:06:42.515',
    status: 'REPLAY',
    title: 'Identical 214 bytes received again',
    detail: 'Same payload hash and X12 controls match TX-214-1080. FreightBridge records replay linkage for audit instead of treating it as a new business event.',
  },
  {
    time: '14:06:42.529',
    status: 'SKIPPED',
    title: 'Duplicate business side effects suppressed',
    detail: 'replay_of=TX-214-1080 · Apex shipment event count remains 1 → 1. No duplicate status callback is created.',
  },
  {
    time: '14:08:03.774',
    status: 'PRESERVED',
    title: 'Late ARRIVED event stored without regressing current status',
    detail: 'AT7=X1 · occurred_at=13:35:00Z · received_at=14:08:03Z. History keeps ARRIVED, but current status remains DELIVERED because DELIVERED occurred later.',
  },
] as const;

export function ReplaySequencePracticePage() {
  const progress = loadTrainingProgress();
  const unlocked = hasCompletedMission(progress, SFTP_STOPS_WORKING_MISSION_ID);
  const [started, setStarted] = useState(false);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<PolicyDraft>({
    duplicateBusiness: 'CREATE_NEW_BUSINESS',
    exactReplay: 'REPROCESS_SIDE_EFFECTS',
    currentStatus: 'LAST_RECEIVED_MESSAGE',
  });
  const [activeFile, setActiveFile] = useState('policy');
  const [complete, setComplete] = useState(isReplaySequencePracticeComplete());

  const checksPassed = checks.every((check) => answers[check.id] === check.answer);
  const policyCorrect = Object.entries(correctPolicy).every(([key, value]) => policy[key as keyof PolicyDraft] === value);
  const canComplete = evidenceLoaded && checksPassed && policyCorrect;

  if (!unlocked) return <Navigate to="/learn/desk" replace />;

  function startPractice() {
    setAnswers({});
    setPolicy({
      duplicateBusiness: 'CREATE_NEW_BUSINESS',
      exactReplay: 'REPROCESS_SIDE_EFFECTS',
      currentStatus: 'LAST_RECEIVED_MESSAGE',
    });
    setActiveFile('policy');
    setEvidenceLoaded(false);
    setComplete(false);
    setStarted(true);
  }

  function finish() {
    if (!canComplete) return;
    completeReplaySequencePractice();
    setComplete(true);
  }

  if (!started) {
    return (
      <section className="workstation-case-start" data-testid="replay-sequence-practice-page">
        <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Training Desk</Link>
        <article className="panel workstation-case-brief">
          <div>
            <p className="eyebrow">Module 05 · Advanced policy clinic</p>
            <h1>Duplicate, replay, and event sequence are three different problems.</h1>
            <p>Inspect one realistic FreightBridge evidence sequence, then configure the policy that prevents duplicate side effects and current-status regression.</p>
          </div>
          <div className="advanced-concept-strip" data-testid="replay-concept-grid">
            <span><AlertTriangle size={16} /><strong>Duplicate business attempt</strong><small>Same shipment submitted again without safe retry semantics.</small></span>
            <span><Repeat2 size={16} /><strong>Exact replay</strong><small>Same X12 controls and identical bytes arrive again.</small></span>
            <span><History size={16} /><strong>Late event</strong><small>Received later, but occurred earlier than the current event.</small></span>
          </div>
          <button className="primary-button" type="button" onClick={startPractice}>
            <Play size={16} />{complete ? 'Replay Advanced Practice' : 'Start Advanced Practice'}
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="replay-sequence-practice-page">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Training Desk</Link>

      <LabWorkstation
        caseLabel="Module 05 · Advanced policy clinic"
        title="Replay, duplicate, and chronology policy"
        subtitle="Run one curated evidence sequence, configure the safe policy, then classify what FreightBridge should do."
        statusLabel={canComplete ? 'Policy verified' : evidenceLoaded ? 'Analyze evidence' : 'Evidence ready'}
        statusTone={canComplete ? 'success' : 'neutral'}
        console={
          <ReplayConsole
            evidenceLoaded={evidenceLoaded}
            onRunEvidence={() => setEvidenceLoaded(true)}
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
          <div className="workstation-complete-actions">
            <Link className="primary-button" to="/learn/practice/independent-investigation">
              Continue to Independent Investigation <ArrowRight size={16} />
            </Link>
            <Link className="secondary-button" to="/learn/desk">Training Desk</Link>
          </div>
        </article>
      )}
    </section>
  );
}

function ReplayConsole({
  evidenceLoaded,
  onRunEvidence,
}: {
  evidenceLoaded: boolean;
  onRunEvidence: () => void;
}) {
  return (
    <div className="replay-workstation-console" data-testid="replay-workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Analyst evidence stream</span><strong>LABREPLAY900</strong></div>
          <small>{evidenceLoaded ? '6 evidence records loaded' : 'Evidence not yet loaded'}</small>
        </div>

        {evidenceLoaded ? (
          <div className="workstation-log-list" data-testid="replay-evidence-log">
            {evidenceLogRows.map((row, index) => (
              <div className="workstation-log-row succeeded" key={row.time + row.status}>
                <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
                <span className="workstation-log-icon"><CheckCircle2 size={15} /></span>
                <span className="workstation-log-copy">
                  <strong>{row.time} · {row.title}</strong>
                  <small>{row.detail}</small>
                </span>
                <span className="workstation-log-status">{row.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="healthy-console-runner">
            <div>
              <Play size={17} />
              <span>
                <strong>Run the evidence sequence once.</strong> Load the analyst-facing records for a duplicate request, an original DELIVERED event, an exact X12 replay, and a late ARRIVED event.
              </span>
            </div>
            <button className="primary-button" type="button" onClick={onRunEvidence}>
              Run Evidence Sequence <Play size={15} />
            </button>
          </div>
        )}

        {evidenceLoaded && (
          <div className="healthy-console-runner complete">
            <CheckCircle2 size={18} />
            <span><strong>Evidence sequence complete.</strong> Nothing else needs to be executed. Use these records to configure the policy in Code.</span>
          </div>
        )}
      </section>

      <aside className="replay-evidence-stack">
        <EvidenceCard
          title="Duplicate Apex request"
          ready={evidenceLoaded}
          rows={evidenceLoaded ? [
            ['Load ID', 'LABREPLAY900'],
            ['Retry identity', 'MISSING'],
            ['Decision', 'BLOCK DUPLICATE BUSINESS'],
            ['Shipments before / after', '1 / 1'],
          ] : pendingRows(['Load ID', 'Retry identity', 'Decision', 'Shipments before / after'])}
        />
        <EvidenceCard
          title="Original DELIVERED"
          ready={evidenceLoaded}
          rows={evidenceLoaded ? [
            ['AT7', 'D1 · DELIVERED'],
            ['occurred_at', '14:00:00Z'],
            ['Transaction', 'TX-214-1080'],
            ['Current status', 'DELIVERED'],
          ] : pendingRows(['AT7', 'occurred_at', 'Transaction', 'Current status'])}
        />
        <EvidenceCard
          title="Exact X12 replay"
          ready={evidenceLoaded}
          rows={evidenceLoaded ? [
            ['Replay of', 'TX-214-1080'],
            ['Same payload hash', 'YES'],
            ['Audit evidence retained', 'YES'],
            ['Business side effects skipped', 'YES'],
            ['Apex events before / after', '1 / 1'],
          ] : pendingRows(['Replay of', 'Same payload hash', 'Audit evidence retained', 'Business side effects skipped', 'Apex events before / after'])}
        />
        <EvidenceCard
          title="Late ARRIVED event"
          ready={evidenceLoaded}
          rows={evidenceLoaded ? [
            ['AT7', 'X1 · ARRIVED'],
            ['occurred_at', '13:35:00Z'],
            ['received_at', '14:08:03Z'],
            ['History stored', 'YES'],
            ['Current status', 'DELIVERED'],
          ] : pendingRows(['AT7', 'occurred_at', 'received_at', 'History stored', 'Current status'])}
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
        <p>The case evidence comes from Console. The policy you configured in Code determines whether FreightBridge creates duplicate effects or protects chronology.</p>
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

function pendingRows(labels: string[]): [string, string][] {
  return labels.map((label) => [label, 'Pending']);
}

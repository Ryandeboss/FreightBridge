import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  FileText,
  History,
  Play,
  Repeat2,
  Server,
  ShieldCheck,
  X,
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

type ReplayStoryTone = 'info' | 'success' | 'warning' | 'blocked';

type ReplayStoryEvent = {
  id: string;
  time: string;
  from: string;
  to: string;
  document: string;
  status: string;
  tone: ReplayStoryTone;
  title: string;
  summary: string;
  explanation: string;
  logLines: readonly string[];
};

const replayStoryEvents: readonly ReplayStoryEvent[] = [
  {
    id: 'initial-tender',
    time: '13:41:20.102',
    from: 'Apex Logistics',
    to: 'FreightBridge',
    document: 'REST / JSON load tender',
    status: 'RECEIVED',
    tone: 'info',
    title: 'Apex tenders load LABREPLAY900',
    summary: 'A new customer load enters FreightBridge and passes the normal inbound checks.',
    explanation: 'This is the healthy starting point. FreightBridge accepts one business request, creates one canonical shipment, and prepares the carrier-facing 204.',
    logLines: [
      '2026-10-01T13:41:20.102Z  INFO  inbound.apex  request_received',
      'method=POST  path=/api/integrations/apex/load-tenders',
      'partner=APEX  correlation_id=fb-6d2f9a',
      'load_id=LABREPLAY900  idempotency_key=apex-LABREPLAY900-v1',
      'json_parse=PASS  contract_validation=PASS',
      'canonical_shipment=CREATED  shipment_id=LABREPLAY900',
      'next_action=DISPATCH_204_MIDWEST',
    ],
  },
  {
    id: 'outbound-204',
    time: '13:41:21.441',
    from: 'FreightBridge',
    to: 'Midwest Carrier',
    document: 'X12 204 Load Tender',
    status: 'SENT',
    tone: 'success',
    title: 'FreightBridge sends the carrier 204',
    summary: 'The canonical shipment is mapped to Midwest’s 004010 204 profile and placed in the SFTP inbound folder.',
    explanation: 'The original business request has now produced the expected carrier-facing document. At this point the integration is healthy.',
    logLines: [
      '2026-10-01T13:41:21.441Z  INFO  outbound.midwest204  dispatch_complete',
      'shipment_number=LABREPLAY900',
      'mapping=CANONICAL_TO_MWCX_204  x12_version=004010',
      'ST01=204  ST02=1079',
      'file_name=FB_MWCX_204_000001079.edi',
      'remote_path=/inbound/FB_MWCX_204_000001079.edi',
      'transport=SFTP  upload=SUCCESS',
    ],
  },
  {
    id: 'duplicate-apex',
    time: '13:42:02.443',
    from: 'Apex Logistics',
    to: 'FreightBridge',
    document: 'REST / JSON load tender',
    status: 'BLOCKED',
    tone: 'blocked',
    title: 'Apex sends LABREPLAY900 a second time',
    summary: 'The same business load ID appears again, but this request has no retry identity.',
    explanation: 'This is a duplicate business attempt, not a safe technical replay. FreightBridge protects the business domain by refusing to create a second shipment or a second 204.',
    logLines: [
      '2026-10-01T13:42:02.443Z  WARN  inbound.apex  duplicate_business_request',
      'method=POST  path=/api/integrations/apex/load-tenders',
      'partner=APEX  correlation_id=fb-7a110c',
      'load_id=LABREPLAY900  idempotency_key=(missing)',
      'existing_business_key=LABREPLAY900',
      'decision=BLOCK_DUPLICATE_BUSINESS  http_status=409',
      'new_shipment_created=false  duplicate_204_created=false',
    ],
  },
  {
    id: 'delivered-214',
    time: '14:03:09.881',
    from: 'Midwest Carrier',
    to: 'FreightBridge',
    document: 'X12 214 Shipment Status',
    status: 'ACCEPTED',
    tone: 'success',
    title: 'Midwest reports the load DELIVERED',
    summary: 'A valid D1 status arrives and moves the canonical shipment forward to DELIVERED.',
    explanation: 'This is the original valid shipment event. Its business timestamp becomes the newest known event time, so DELIVERED becomes the current status.',
    logLines: [
      '2026-10-01T14:03:09.881Z  INFO  inbound.midwest214  transaction_accepted',
      'file_name=MWCX_APEX_214_000001080.edi',
      'shipment_number=LABREPLAY900  ST01=214  ST02=1080',
      'AT7_01=D1  mapped_status=DELIVERED',
      'occurred_at=2026-10-01T14:00:00Z',
      'transaction_id=TX-214-1080  payload_sha256=9f1c...e7a4',
      'history_append=true  current_status=DELIVERED',
      'apex_status_callback=CREATED  apex_event_count=1',
    ],
  },
  {
    id: 'exact-replay',
    time: '14:06:42.515',
    from: 'Midwest Carrier',
    to: 'FreightBridge',
    document: 'X12 214 Shipment Status',
    status: 'REPLAY',
    tone: 'warning',
    title: 'The same DELIVERED 214 arrives again',
    summary: 'FreightBridge sees the same control numbers and the same payload hash as the already processed transaction.',
    explanation: 'The repeated bytes are useful audit evidence, but they are not a new shipment event. The important distinction is between recording the replay and repeating its business side effects.',
    logLines: [
      '2026-10-01T14:06:42.515Z  WARN  inbound.midwest214  exact_replay_detected',
      'file_name=MWCX_APEX_214_000001080_REPLAY.edi',
      'shipment_number=LABREPLAY900  ST01=214  ST02=1080',
      'payload_sha256=9f1c...e7a4',
      'matching_transaction_id=TX-214-1080',
      'control_match=true  payload_hash_match=true',
      'classification=EXACT_X12_REPLAY',
    ],
  },
  {
    id: 'replay-policy',
    time: '14:06:42.529',
    from: 'FreightBridge',
    to: 'Apex Logistics',
    document: 'Replay policy decision',
    status: 'SUPPRESSED',
    tone: 'info',
    title: 'FreightBridge records the replay but suppresses a second callback',
    summary: 'The replay remains auditable while the customer-facing business effect is skipped.',
    explanation: 'This is the safe replay policy: preserve traceability, link the replay to the original transaction, and do not duplicate downstream business effects.',
    logLines: [
      '2026-10-01T14:06:42.529Z  INFO  replay.policy  side_effects_suppressed',
      'replay_transaction_id=TX-214-1080-R1',
      'replay_of_transaction_id=TX-214-1080',
      'audit_record_created=true',
      'business_side_effects_skipped=true',
      'apex_status_callback_created=false',
      'apex_event_count_before=1  apex_event_count_after=1',
    ],
  },
  {
    id: 'late-arrived',
    time: '14:08:03.774',
    from: 'Midwest Carrier',
    to: 'FreightBridge',
    document: 'X12 214 Shipment Status',
    status: 'LATE EVENT',
    tone: 'warning',
    title: 'An ARRIVED 214 shows up after DELIVERED',
    summary: 'The message arrived later, but its business event time says ARRIVED happened before DELIVERED.',
    explanation: 'Receipt order and business chronology are different. The ARRIVED event is valid history, but it should not roll the shipment backward just because the file arrived later.',
    logLines: [
      '2026-10-01T14:08:03.774Z  WARN  inbound.midwest214  out_of_order_event',
      'file_name=MWCX_APEX_214_000001081.edi',
      'shipment_number=LABREPLAY900  ST01=214  ST02=1081',
      'AT7_01=X1  mapped_status=ARRIVED',
      'occurred_at=2026-10-01T13:35:00Z',
      'received_at=2026-10-01T14:08:03Z',
      'current_status_before=DELIVERED  current_event_time=2026-10-01T14:00:00Z',
    ],
  },
  {
    id: 'chronology-policy',
    time: '14:08:03.790',
    from: 'FreightBridge',
    to: 'Canonical Shipment',
    document: 'Status chronology decision',
    status: 'PRESERVED',
    tone: 'success',
    title: 'FreightBridge stores ARRIVED but keeps DELIVERED current',
    summary: 'The event is added to history, while the current status continues to follow the latest occurred_at time.',
    explanation: 'This is the chronology rule the learner needs to identify: current status follows the latest business event time, not whichever message happened to be received last.',
    logLines: [
      '2026-10-01T14:08:03.790Z  INFO  shipment.status  chronology_evaluated',
      'shipment_number=LABREPLAY900',
      'candidate_status=ARRIVED  candidate_occurred_at=2026-10-01T13:35:00Z',
      'current_status=DELIVERED  current_occurred_at=2026-10-01T14:00:00Z',
      'history_append=true',
      'current_status_changed=false',
      'current_status_after=DELIVERED',
      'decision=KEEP_LATEST_OCCURRED_AT',
    ],
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = replayStoryEvents.find((event) => event.id === selectedEventId) ?? null;

  return (
    <div className="replay-workstation-console replay-story-console" data-testid="replay-workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Integration timeline</span><strong>LABREPLAY900</strong></div>
          <small>{evidenceLoaded ? '8 records · click any record to inspect its server log' : 'Scenario ready'}</small>
        </div>

        {!evidenceLoaded ? (
          <div className="replay-story-start">
            <div className="replay-story-start-icon"><FileText size={22} /></div>
            <div>
              <span className="eyebrow">Scenario</span>
              <h3>Apex tenders one load to Midwest through FreightBridge.</h3>
              <p>
                The shipment starts normally. Then three things happen: Apex submits the same business load again,
                Midwest sends an identical 214 twice, and an older ARRIVED event reaches FreightBridge after DELIVERED.
              </p>
              <p>Your job is to inspect the evidence and decide which behaviors are duplicates, replays, and out-of-order events.</p>
            </div>
            <button className="primary-button" type="button" onClick={onRunEvidence}>
              Run Evidence Sequence <Play size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="replay-story-context">
              <strong>What happened?</strong>
              <span>
                Follow the documents in order. Green records are normal processing, amber records need analyst attention,
                and red means FreightBridge intentionally blocked a business action.
              </span>
            </div>

            <div className="replay-story-list" data-testid="replay-evidence-log">
              {replayStoryEvents.map((event, index) => (
                <button
                  className={'replay-story-row ' + event.tone}
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedEventId(event.id)}
                  data-testid={'replay-story-event-' + event.id}
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
                    <span className="replay-story-document">{event.time} · {event.document}</span>
                  </span>
                  <span className={'replay-story-status ' + event.tone}>{event.status}</span>
                  <ChevronRight className="replay-story-open" size={17} aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="replay-story-finish">
              <ShieldCheck size={19} />
              <span><strong>Timeline complete.</strong> Open the records that matter, then use Code and Answer to define the safe policy.</span>
            </div>
          </>
        )}
      </section>

      {selectedEvent && (
        <div className="replay-log-backdrop" role="presentation" onClick={() => setSelectedEventId(null)}>
          <section
            className={'replay-log-modal ' + selectedEvent.tone}
            role="dialog"
            aria-modal="true"
            aria-labelledby="replay-log-title"
            onClick={(event) => event.stopPropagation()}
            data-testid="replay-log-viewer"
          >
            <header className="replay-log-header">
              <div>
                <span>{selectedEvent.time} · {selectedEvent.document}</span>
                <h3 id="replay-log-title">{selectedEvent.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedEventId(null)} aria-label="Close log">
                <X size={19} />
              </button>
            </header>

            <div className="replay-log-route">
              <span>{selectedEvent.from}</span>
              <ChevronRight size={16} />
              <span>{selectedEvent.to}</span>
              <strong className={'replay-story-status ' + selectedEvent.tone}>{selectedEvent.status}</strong>
            </div>

            <div className="replay-log-summary">
              <strong>What the analyst sees</strong>
              <p>{selectedEvent.summary}</p>
            </div>

            <div className="replay-log-terminal">
              <div className="replay-log-terminal-bar">
                <span>freightbridge-prod.log</span>
                <small>read-only training evidence</small>
              </div>
              <pre><code>{selectedEvent.logLines.join('\n')}</code></pre>
            </div>

            <div className="replay-log-explanation">
              <strong>Why this record matters</strong>
              <p>{selectedEvent.explanation}</p>
            </div>
          </section>
        </div>
      )}
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

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode2,
  FileJson2,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, recoverLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import {
  completeIndependentInvestigation,
  isIndependentInvestigationComplete,
  isReplaySequencePracticeComplete,
} from '../training/advancedPractice';

type EvidenceView = 'summary' | 'payload' | 'failure';
type CodeFile = 'policy' | 'contract' | 'fix';

const diagnosisOptions = [
  {
    value: 'duplicate-no-idempotency',
    label: 'A repeated Apex request reused an existing load ID without safe retry identity, so FreightBridge blocked a duplicate business effect.',
  },
  {
    value: 'authentication',
    label: 'Apex credentials were rejected before FreightBridge could associate the repeated request with an existing shipment.',
  },
  {
    value: 'parsing',
    label: 'The second Apex request reached FreightBridge but malformed JSON prevented the platform from reading the business identifier.',
  },
  {
    value: 'downstream',
    label: 'FreightBridge created another valid shipment and the duplicate behavior began only after a second Midwest tender was sent.',
  },
];

export function IndependentInvestigationPage() {
  const unlocked = isReplaySequencePracticeComplete() || isIndependentInvestigationComplete();
  const alreadyComplete = isIndependentInvestigationComplete();
  const { token, handleApiError } = useOperationsSession();
  const [run, setRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceView>('summary');
  const [activeFile, setActiveFile] = useState<CodeFile>('policy');
  const [boundary, setBoundary] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [diagnosisSubmitted, setDiagnosisSubmitted] = useState(false);
  const [retryMode, setRetryMode] = useState('NEW_BUSINESS_REQUEST');
  const [reuseExistingShipment, setReuseExistingShipment] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [report, setReport] = useState('');
  const [completed, setCompleted] = useState(alreadyComplete);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failureDrill = useMemo(() => record(run?.resultSummary.failureDrill), [run]);
  const observed = record(failureDrill?.observed);
  const payloadPreview = failureDrill?.payloadPreview;
  const recovery = record(recoveryRun?.resultSummary.recovery);

  const diagnosisCorrect = boundary === 'BUSINESS_VALIDATION' && diagnosis === 'duplicate-no-idempotency';
  const diagnosisAccepted = diagnosisSubmitted && diagnosisCorrect;
  const fixReady =
    retryMode === 'IDEMPOTENT_REPLAY'
    && reuseExistingShipment
    && idempotencyKey.trim().length >= 8;
  const verified = Boolean(
    run
      && recoveryRun
      && recoveryRun.businessIdentifier === run.businessIdentifier
      && recovery?.status === 'SUCCEEDED'
      && recovery?.recoveryKind === 'IDEMPOTENT_REPLAY'
      && recovery?.sameBusinessIdentifier === true
      && recovery?.idempotentReplay === true
      && recovery?.originalShipmentReused === true
      && recovery?.duplicate204Created === false,
  );
  const canComplete = verified && report.trim().length >= 80;

  if (!unlocked) return <Navigate to="/learn/desk" replace />;

  async function startCase() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setRun(null);
    setRecoveryRun(null);
    setSelectedEvidence('summary');
    setActiveFile('policy');
    setBoundary('');
    setDiagnosis('');
    setDiagnosisSubmitted(false);
    setRetryMode('NEW_BUSINESS_REQUEST');
    setReuseExistingShipment(false);
    setIdempotencyKey('');
    setReport('');
    setCompleted(false);

    try {
      let nextRun = await createLabRun(token, {
        scenarioKey: 'APEX_DUPLICATE_SHIPMENT',
        loadId: ('IND' + Date.now().toString(36).toUpperCase()).slice(0, 30),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Independent Investigation Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 12) {
        const result = await runNextLabStep(token, nextRun.id);
        nextRun = result.run;
        guard += 1;
      }
      if (nextRun.status !== 'SUCCEEDED') {
        throw new Error('The assigned investigation did not produce its expected evidence.');
      }
      setRun(nextRun);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The independent case could not be started.');
    } finally {
      setWorking(false);
    }
  }

  function submitDiagnosis() {
    setDiagnosisSubmitted(true);
  }

  async function verifyFix() {
    if (!token || !run || !diagnosisAccepted || !fixReady) return;
    setWorking(true);
    setError(null);
    setRecoveryRun(null);
    try {
      const recovered = await recoverLabRun(token, run.id);
      setRecoveryRun(recovered);
      const evidence = record(recovered.resultSummary.recovery);
      const okay = Boolean(
        recovered.businessIdentifier === run.businessIdentifier
          && evidence?.status === 'SUCCEEDED'
          && evidence?.recoveryKind === 'IDEMPOTENT_REPLAY'
          && evidence?.sameBusinessIdentifier === true
          && evidence?.idempotentReplay === true
          && evidence?.originalShipmentReused === true
          && evidence?.duplicate204Created === false,
      );
      if (!okay) setError('Recovery ran, but the evidence did not prove a safe idempotent retry.');
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The independent recovery could not be verified.');
    } finally {
      setWorking(false);
    }
  }

  function completeCase() {
    if (!canComplete) return;
    completeIndependentInvestigation();
    setCompleted(true);
  }

  if (!run) {
    return (
      <section className="workstation-case-start independent-case-start" data-testid="independent-investigation-page">
        <Link className="secondary-button training-back-link" to="/learn/desk">
          <ArrowLeft size={16} /> Training Desk
        </Link>

        <article className="panel workstation-case-brief independent-ticket">
          <div>
            <p className="eyebrow">Module 06 · Independent Investigation</p>
            <h1>Apex says one load request was rejected after they retried it.</h1>
            <p>
              You are on your own for the investigation path. Determine what FreightBridge observed,
              decide whether the retry was safe, make the controlled retry-policy correction, verify it,
              and write the incident update.
            </p>
          </div>

          <div className="independent-ticket-grid">
            <div>
              <span>Customer report</span>
              <strong>“We retried the same load after the first request. FreightBridge rejected the retry.”</strong>
            </div>
            <div>
              <span>What Mike gives you</span>
              <strong>The business identifier and FreightBridge evidence. No checkpoint map, no hints, no required-click sequence.</strong>
            </div>
          </div>

          <div className="advanced-incident-expectation">
            <ShieldCheck size={18} />
            <span>
              This module grades the result, not the path. Inspect whatever evidence you think matters and decide where to work next.
            </span>
          </div>

          <div className="lab-actions">
            <button className="primary-button" type="button" onClick={startCase} disabled={working}>
              <Play size={16} /> {working ? 'Opening case…' : alreadyComplete ? 'Replay Independent Case' : 'Open Assigned Case'}
            </button>
            <Link className="secondary-button" to="/learn/practice/replay-sequence">Review Advanced Practice</Link>
          </div>
        </article>

        {error && <CaseError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="independent-investigation-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>

      {error && <CaseError message={error} />}

      <LabWorkstation
        caseLabel="Module 06 · Independent Investigation"
        title="Apex retry rejected"
        subtitle="Use the evidence you choose. No checkpoint classifier, hint ladder, or required evidence sequence is provided."
        statusLabel={verified ? 'Recovery verified' : diagnosisAccepted ? 'Fix required' : 'Investigation open'}
        statusTone={verified ? 'success' : 'neutral'}
        console={
          <IndependentConsole
            run={run}
            failureDrill={failureDrill}
            observed={observed}
            payloadPreview={payloadPreview}
            selected={selectedEvidence}
            onSelect={setSelectedEvidence}
          />
        }
        code={
          <IndependentCode
            activeFile={activeFile}
            retryMode={retryMode}
            reuseExistingShipment={reuseExistingShipment}
            idempotencyKey={idempotencyKey}
            fixReady={fixReady}
            onFile={setActiveFile}
            onRetryMode={setRetryMode}
            onReuseExisting={setReuseExistingShipment}
            onIdempotencyKey={setIdempotencyKey}
          />
        }
        answer={
          <IndependentAnswer
            boundary={boundary}
            diagnosis={diagnosis}
            diagnosisSubmitted={diagnosisSubmitted}
            diagnosisAccepted={diagnosisAccepted}
            fixReady={fixReady}
            verified={verified}
            recovery={recovery}
            report={report}
            working={working}
            completed={completed}
            onBoundary={(value) => {
              setBoundary(value);
              setDiagnosisSubmitted(false);
            }}
            onDiagnosis={(value) => {
              setDiagnosis(value);
              setDiagnosisSubmitted(false);
            }}
            onSubmitDiagnosis={submitDiagnosis}
            onVerify={verifyFix}
            onReport={setReport}
            onComplete={completeCase}
          />
        }
      />

      {completed && (
        <article className="panel workstation-complete" data-testid="independent-investigation-completion">
          <CheckCircle2 size={24} />
          <div>
            <p className="eyebrow">Independent investigation complete</p>
            <h2>You are cleared for the Final Shift.</h2>
            <p>
              You selected your own evidence path, diagnosed the business-validation failure,
              configured a safe retry, and proved recovery without duplicate downstream work.
            </p>
          </div>
          <div className="workstation-complete-actions">
            <Link className="primary-button" to="/learn/mission/production-incident">
              Continue to Final Shift <ArrowRight size={16} />
            </Link>
            <Link className="secondary-button" to="/learn/desk">Training Desk</Link>
          </div>
        </article>
      )}
    </section>
  );
}

function IndependentConsole({
  run,
  failureDrill,
  observed,
  payloadPreview,
  selected,
  onSelect,
}: {
  run: LabRun;
  failureDrill: Record<string, unknown> | null;
  observed: Record<string, unknown> | null;
  payloadPreview: unknown;
  selected: EvidenceView;
  onSelect: (value: EvidenceView) => void;
}) {
  const evidence = selected === 'summary'
    ? {
        title: 'Case summary',
        value: {
          businessIdentifier: run.businessIdentifier,
          runStatus: run.status,
          attemptsObserved: run.steps.length,
          transactionEvidencePresent: Boolean(observed?.transactionId),
        },
      }
    : selected === 'payload'
      ? { title: 'Inbound payload evidence', value: payloadPreview ?? {} }
      : {
          title: 'Persisted failure evidence',
          value: {
            errorCode: observed?.errorCode ?? null,
            category: observed?.category ?? null,
            stage: observed?.stage ?? null,
            safeMessage: observed?.safeMessage ?? null,
            transactionId: observed?.transactionId ?? null,
            businessIdentifier: observed?.businessIdentifier ?? null,
          },
        };

  return (
    <div className="independent-console" data-testid="independent-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>FreightBridge activity</span><strong>{run.businessIdentifier}</strong></div>
          <small>Nothing is pre-classified for you. Decide what matters.</small>
        </div>

        <div className="workstation-log-list">
          {run.steps.map((step, index) => (
            <div className="workstation-log-row succeeded" key={step.id}>
              <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="workstation-log-icon"><CheckCircle2 size={15} /></span>
              <span className="workstation-log-copy">
                <strong>{index === 0 ? 'Inbound request 01' : 'Inbound request 02'}</strong>
                <small>{step.transport} · {step.messageFormat} · {step.documentType}</small>
              </span>
              <span className="workstation-log-status">OBSERVED</span>
            </div>
          ))}
        </div>

        <div className="independent-evidence-menu" aria-label="Available case evidence">
          <button className={selected === 'summary' ? 'active' : ''} type="button" onClick={() => onSelect('summary')}>
            Case Summary
          </button>
          <button className={selected === 'payload' ? 'active' : ''} type="button" onClick={() => onSelect('payload')}>
            Payload Evidence
          </button>
          <button className={selected === 'failure' ? 'active' : ''} type="button" onClick={() => onSelect('failure')}>
            Persisted Failure
          </button>
        </div>

        <div className="independent-no-hints">
          <Circle size={15} />
          <span>No evidence source is required. You decide what to inspect and in what order.</span>
        </div>
      </section>

      <aside className="workstation-inspector">
        <div className="workstation-pane-heading">
          <div><span>Evidence viewer</span><strong>{evidence.title}</strong></div>
        </div>
        <div className="workstation-raw" data-testid="independent-evidence-viewer">
          <div><FileJson2 size={16} /><span>FreightBridge-visible data</span></div>
          <pre>{raw(evidence.value)}</pre>
          <small>Partner-private logs and hidden system state are not shown.</small>
        </div>
        <div className="independent-case-note">
          <strong>Analyst rule</strong>
          <p>The Lab run succeeding means the controlled incident was reproduced as expected. It does not mean the business request itself was healthy.</p>
        </div>
      </aside>
    </div>
  );
}

function IndependentCode({
  activeFile,
  retryMode,
  reuseExistingShipment,
  idempotencyKey,
  fixReady,
  onFile,
  onRetryMode,
  onReuseExisting,
  onIdempotencyKey,
}: {
  activeFile: CodeFile;
  retryMode: string;
  reuseExistingShipment: boolean;
  idempotencyKey: string;
  fixReady: boolean;
  onFile: (value: CodeFile) => void;
  onRetryMode: (value: string) => void;
  onReuseExisting: (value: boolean) => void;
  onIdempotencyKey: (value: string) => void;
}) {
  const files: Array<{ id: CodeFile; path: string }> = [
    { id: 'policy', path: 'Processing/idempotency.ts' },
    { id: 'contract', path: 'Partner Contracts/apex_retry_policy.json' },
    { id: 'fix', path: 'Fix/retry_policy.training.json' },
  ];

  return (
    <div className="workstation-code advanced-workstation-code" data-testid="independent-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading">
          <div><span>Workspace</span><strong>Choose what to inspect</strong></div>
        </div>
        <div className="workstation-file-list">
          {files.map((file) => (
            <button key={file.id} className={activeFile === file.id ? 'active' : ''} type="button" onClick={() => onFile(file.id)}>
              <FileCode2 size={14} /><span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workstation-editor">
        <div className="workstation-editor-bar">
          <span>{files.find((file) => file.id === activeFile)?.path}</span>
          <small>{activeFile === 'fix' ? 'Editable training control' : 'Read only'}</small>
        </div>

        {activeFile === 'policy' && (
          <pre data-testid="independent-code-content"><code>{[
            'existing = findShipmentByBusinessId(payload.loadId)',
            '',
            'if existing and request.hasRecognizedIdempotencyKey:',
            '    return priorBusinessResult(existing)',
            '',
            'if existing:',
            "    raise DUPLICATE_SHIPMENT",
          ].join('\n')}</code></pre>
        )}

        {activeFile === 'contract' && (
          <pre data-testid="independent-code-content"><code>{JSON.stringify({
            businessIdentifier: 'loadId',
            safeRetryRequires: 'recognized Idempotency-Key',
            duplicateShipmentCreation: 'forbidden',
            duplicateDownstream204: 'forbidden',
          }, null, 2)}</code></pre>
        )}

        {activeFile === 'fix' && (
          <div className="advanced-edit-form" data-testid="independent-fix-editor">
            <label>
              <span>Retry intent</span>
              <select value={retryMode} onChange={(event) => onRetryMode(event.target.value)}>
                <option value="NEW_BUSINESS_REQUEST">Treat retry as a new business request</option>
                <option value="IDEMPOTENT_REPLAY">Treat retry as an idempotent replay</option>
              </select>
            </label>

            <label>
              <span>Idempotency key</span>
              <input
                value={idempotencyKey}
                onChange={(event) => onIdempotencyKey(event.target.value)}
                placeholder="Enter a stable retry key"
              />
            </label>

            <label className="advanced-checkbox">
              <input
                type="checkbox"
                checked={reuseExistingShipment}
                onChange={(event) => onReuseExisting(event.target.checked)}
              />
              <span>Reuse the existing shipment/business result instead of creating a second shipment</span>
            </label>

            <pre><code>{JSON.stringify({
              retryMode,
              idempotencyKey: idempotencyKey || '(not set)',
              reuseExistingShipment,
            }, null, 2)}</code></pre>

            <div className={'advanced-edit-status ' + (fixReady ? 'ready' : '')}>
              {fixReady
                ? 'Controlled retry policy is ready for verification.'
                : 'The controlled retry policy is not yet safe to verify.'}
            </div>
          </div>
        )}
      </section>

      <aside className="workstation-code-note">
        <ShieldCheck size={19} />
        <strong>No guided fix</strong>
        <p>Compare the observed case with the retry policy. The workstation will only tell you whether the final correction verifies successfully.</p>
      </aside>
    </div>
  );
}

function IndependentAnswer({
  boundary,
  diagnosis,
  diagnosisSubmitted,
  diagnosisAccepted,
  fixReady,
  verified,
  recovery,
  report,
  working,
  completed,
  onBoundary,
  onDiagnosis,
  onSubmitDiagnosis,
  onVerify,
  onReport,
  onComplete,
}: {
  boundary: string;
  diagnosis: string;
  diagnosisSubmitted: boolean;
  diagnosisAccepted: boolean;
  fixReady: boolean;
  verified: boolean;
  recovery: Record<string, unknown> | null;
  report: string;
  working: boolean;
  completed: boolean;
  onBoundary: (value: string) => void;
  onDiagnosis: (value: string) => void;
  onSubmitDiagnosis: () => void;
  onVerify: () => void;
  onReport: (value: string) => void;
  onComplete: () => void;
}) {
  return (
    <div className="workstation-answer independent-answer" data-testid="independent-answer">
      <div className="workstation-answer-intro">
        <span>Case report</span>
        <h2>State your diagnosis. Then prove the fix.</h2>
        <p>There is no last-healthy quiz or hint ladder here. Use the Console and Code evidence to make the call.</p>
      </div>

      <div className="independent-answer-fields">
        <label>
          <span>Primary failure boundary</span>
          <select value={boundary} onChange={(event) => onBoundary(event.target.value)}>
            <option value="">Choose a boundary</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="PARSING">Parsing</option>
            <option value="VALIDATION">Contract validation</option>
            <option value="BUSINESS_VALIDATION">Business validation</option>
            <option value="MAPPING">Mapping</option>
            <option value="TRANSPORT">Transport</option>
          </select>
        </label>

        <label>
          <span>Primary diagnosis</span>
          <select value={diagnosis} onChange={(event) => onDiagnosis(event.target.value)}>
            <option value="">Choose a diagnosis</option>
            {diagnosisOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <button className="secondary-button" type="button" onClick={onSubmitDiagnosis} disabled={!boundary || !diagnosis}>
          Submit Diagnosis
        </button>

        {diagnosisSubmitted && (
          <div className={'independent-diagnosis-result ' + (diagnosisAccepted ? 'accepted' : 'rejected')} data-testid="independent-diagnosis-result">
            {diagnosisAccepted
              ? 'Diagnosis accepted. Make the corrective change in Code and verify it.'
              : 'Diagnosis not accepted. Re-check the case evidence and failure boundary.'}
          </div>
        )}
      </div>

      <div className={'advanced-fix-readiness ' + (fixReady ? 'ready' : '')}>
        <FileCode2 size={18} />
        <div>
          <strong>{fixReady ? 'Controlled fix ready' : 'Controlled fix incomplete'}</strong>
          <p>Use the Code tab to define how FreightBridge should handle this retry.</p>
        </div>
      </div>

      <button
        className="primary-button"
        type="button"
        onClick={onVerify}
        disabled={working || !diagnosisAccepted || !fixReady}
      >
        {working ? 'Verifying recovery…' : 'Apply Fix & Verify'}
      </button>

      {recovery && (
        <article className={'guided-verification ' + (verified ? 'verified' : '')} data-testid="independent-verification">
          <div>
            <CheckCircle2 size={20} />
            <div>
              <strong>{verified ? 'Recovery verified' : 'Recovery evidence incomplete'}</strong>
              <p>Verify business identity was reused and no duplicate 204 was created.</p>
            </div>
          </div>
          <dl>
            <div><dt>Recovery Kind</dt><dd>{display(recovery.recoveryKind)}</dd></div>
            <div><dt>Same Business ID</dt><dd>{yesNo(recovery.sameBusinessIdentifier)}</dd></div>
            <div><dt>Idempotent Replay</dt><dd>{yesNo(recovery.idempotentReplay)}</dd></div>
            <div><dt>Shipment Reused</dt><dd>{yesNo(recovery.originalShipmentReused)}</dd></div>
            <div><dt>Duplicate 204 Created</dt><dd>{yesNo(recovery.duplicate204Created)}</dd></div>
          </dl>
        </article>
      )}

      {verified && (
        <label className="guided-status-update">
          <span>Incident update to Mike</span>
          <textarea
            value={report}
            onChange={(event) => onReport(event.target.value)}
            placeholder="Summarize the customer report, FreightBridge evidence, root cause, correction, and verified outcome."
          />
          <small>{report.trim().length} / 80 minimum characters</small>
        </label>
      )}

      <button className="secondary-button" type="button" onClick={onComplete} disabled={!verified || report.trim().length < 80 || completed}>
        <CheckCircle2 size={16} /> {completed ? 'Investigation Complete' : 'Complete Independent Investigation'}
      </button>
    </div>
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function yesNo(value: unknown): string {
  if (value === true) return 'YES';
  if (value === false) return 'NO';
  return '—';
}

function raw(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
}

function CaseError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div>
        <h2>The independent case hit an unexpected system issue.</h2>
        <p>{message}</p>
      </div>
    </article>
  );
}

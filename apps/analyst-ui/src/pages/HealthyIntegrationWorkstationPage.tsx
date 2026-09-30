import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode2,
  FileJson2,
  Play,
  RotateCcw,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, fetchLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import {
  loadHealthyWalkthroughState,
  saveHealthyShipmentStatusProgress,
} from '../training/healthyWalkthrough';
import {
  asRecord,
  find204Preview,
  findApexPayload,
  findCanonicalShipment,
  findStep,
  rawEvidence,
  shipmentEvents,
} from '../training/labEvidence';
import { LEARN_THE_FLOW_MISSION_ID } from '../training/missions';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';

type DetailMode = 'processing' | 'raw';
type HealthyStatus = 'SUCCEEDED' | 'PENDING';

type HealthyCheckpoint = {
  id: string;
  title: string;
  source: string;
  status: HealthyStatus;
  boundary: string;
  protocol: string;
  format: string;
  document: string;
  observed: string;
  meaning: string;
  raw: unknown;
};

type CodeFile = {
  id: string;
  path: string;
  language: string;
  content: string;
  note: string;
};

const codeFiles: CodeFile[] = [
  {
    id: 'sequence',
    path: 'Reference/healthy_sequence.md',
    language: 'markdown',
    content: [
      'Apex REST/JSON tender',
      '  -> FreightBridge canonical shipment',
      '  -> X12 204',
      '  -> SFTP to Midwest',
      '  -> 997 technical acknowledgment',
      '  -> 990 business tender response',
      '  -> 214 PICKED_UP / IN_TRANSIT / ARRIVED / DELIVERED',
      '  -> Apex-facing shipment status',
    ].join('\n'),
    note: 'Use this as the baseline order. Later incident labs ask where the real flow first diverges from it.',
  },
  {
    id: 'apex-contract',
    path: 'Partner Contracts/apex_rest_contract.json',
    language: 'json',
    content: [
      '{',
      '  "partnerCode": "APEX",',
      '  "transport": "REST",',
      '  "messageFormat": "JSON",',
      '  "inboundDocument": "Load Tender",',
      '  "authentication": "Bearer credential"',
      '}',
    ].join('\n'),
    note: 'Apex reaches FreightBridge through REST/HTTP and sends JSON. Authentication happens before parsing and mapping.',
  },
  {
    id: 'apex-map',
    path: 'Mappings/apex_to_canonical.ts',
    language: 'typescript',
    content: [
      'export function apexToCanonical(payload) {',
      '  return {',
      '    shipmentNumber: payload.loadId,',
      '    origin: payload.pickup,',
      '    destination: payload.delivery,',
      '    equipmentType: payload.equipmentType,',
      '    weightLbs: payload.weightLbs,',
      '  };',
      '}',
    ].join('\n'),
    note: 'The canonical shipment gives FreightBridge one internal business identity before partner-specific outbound mapping.',
  },
  {
    id: '204-map',
    path: 'Mappings/canonical_to_midwest_204.ts',
    language: 'typescript',
    content: [
      'export function canonicalToMidwest204(shipment) {',
      '  return {',
      '    B2_04: shipment.shipmentNumber,',
      '    L11_BM: shipment.references.BOL,',
      '    L11_PO: shipment.references.PO,',
      '    pickup: shipment.origin,',
      '    delivery: shipment.destination,',
      '  };',
      '}',
      '',
      '// Active Midwest profile: X12 004010',
    ].join('\n'),
    note: 'FreightBridge creates the 204 from canonical data, then SFTP transports the resulting X12 file.',
  },
  {
    id: 'midwest-profile',
    path: 'Partner Contracts/midwest_004010_profile.json',
    language: 'json',
    content: [
      '{',
      '  "partnerCode": "MWCX",',
      '  "transport": "SFTP",',
      '  "messageFormat": "X12",',
      '  "isaVersion": "00401",',
      '  "gsVersion": "004010",',
      '  "documents": ["204", "997", "990", "214"]',
      '}',
    ].join('\n'),
    note: 'The transport contract and X12 profile are related but different: SFTP moves files; 004010 defines the EDI profile.',
  },
  {
    id: 'status-map',
    path: 'Mappings/midwest_214_status_map.ts',
    language: 'typescript',
    content: [
      'export const statusMap = {',
      "  AF: 'PICKED_UP',",
      "  X6: 'IN_TRANSIT',",
      "  X1: 'ARRIVED',",
      "  D1: 'DELIVERED',",
      '};',
    ].join('\n'),
    note: 'Later mapping incidents will use this same file. In the healthy baseline, every expected status code maps successfully.',
  },
  {
    id: 'acks',
    path: 'Reference/997_vs_990.md',
    language: 'markdown',
    content: [
      '997 = technical / functional acknowledgment.',
      'It confirms the EDI transaction was received and structurally acknowledged.',
      '',
      '990 = business tender response.',
      'It tells FreightBridge whether Midwest accepted or rejected the load.',
      '',
      'A successful 997 never means carrier acceptance by itself.',
    ].join('\n'),
    note: 'This distinction is one of the most important healthy-flow signals to remember.',
  },
];

const questions = [
  {
    id: 'sftp',
    prompt: 'FreightBridge successfully delivered the 204 file over SFTP. Does that prove Midwest accepted the load?',
    correct: 'no',
    options: [
      { id: 'yes', label: 'Yes — successful SFTP delivery means the carrier accepted it.' },
      { id: 'no', label: 'No — it proves file delivery, not the carrier business decision.' },
    ],
    hint: 'Transport success proves the file moved. Look for the business-response transaction.',
  },
  {
    id: '990',
    prompt: 'Which document proves the carrier business tender decision?',
    correct: '990',
    options: [
      { id: '997', label: '997 Functional Acknowledgment' },
      { id: '990', label: '990 Tender Response' },
      { id: '214', label: '214 Shipment Status' },
    ],
    hint: 'The 997 is technical acknowledgment. The 990 answers accept or reject.',
  },
  {
    id: 'x6',
    prompt: 'Midwest sends AT7 status X6 in a healthy 214. What should FreightBridge normalize it to?',
    correct: 'in-transit',
    options: [
      { id: 'picked', label: 'PICKED_UP' },
      { id: 'in-transit', label: 'IN_TRANSIT' },
      { id: 'arrived', label: 'ARRIVED' },
    ],
    hint: 'The active status map is AF → PICKED_UP, X6 → IN_TRANSIT, X1 → ARRIVED, D1 → DELIVERED.',
  },
] as const;

export function HealthyIntegrationWorkstationPage() {
  const { token, handleApiError } = useOperationsSession();
  const saved = loadHealthyWalkthroughState();
  const priorMissionComplete = hasCompletedMission(loadTrainingProgress(), LEARN_THE_FLOW_MISSION_ID);
  const [run, setRun] = useState<LabRun | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState('apex');
  const [detailMode, setDetailMode] = useState<DetailMode>('processing');
  const [activeFileId, setActiveFileId] = useState(codeFiles[0].id);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(saved?.part4Complete === true && priorMissionComplete);

  const checkpoints = useMemo(() => buildHealthyCheckpoints(run), [run]);
  const selectedCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? checkpoints[0];
  const activeFile = codeFiles.find((file) => file.id === activeFileId) ?? codeFiles[0];
  const runComplete = isHealthyRunComplete(run);
  const correctAnswers = questions.filter((question) => answers[question.id] === question.correct).length;
  const checksComplete = correctAnswers === questions.length;
  const canComplete = Boolean(run && runComplete && checksComplete);

  async function startOrResume() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setCompleted(false);
    setAnswers({});
    try {
      let nextRun: LabRun | null = null;
      if (saved?.runId) {
        try {
          nextRun = await fetchLabRun(token, saved.runId);
        } catch {
          nextRun = null;
        }
      }
      if (!nextRun) {
        nextRun = await createLabRun(token, {
          scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
          loadId: ('HEALTHY' + Date.now().toString(36).toUpperCase()).slice(0, 30),
          commodityDescription: 'Healthy Baseline Training Freight',
          equipmentType: 'VAN_53',
          weightLbs: 42000,
          pieces: 22,
        });
      }
      setRun(nextRun);
      setSelectedCheckpointId(lastCompletedCheckpointId(nextRun));
      setDetailMode('processing');
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The healthy Lab run could not be opened.');
    } finally {
      setWorking(false);
    }
  }

  async function runNextCheckpoint() {
    if (!token || !run || runComplete) return;
    setWorking(true);
    setError(null);
    try {
      const result = await runNextLabStep(token, run.id);
      setRun(result.run);
      setSelectedCheckpointId(lastCompletedCheckpointId(result.run));
      setDetailMode('processing');
      if (result.run.status === 'FAILED') {
        setError('The healthy baseline hit an unexpected system failure. This lab does not intentionally inject a failure.');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The next healthy checkpoint could not be executed.');
    } finally {
      setWorking(false);
    }
  }

  function finishHealthyLab() {
    if (!run || !canComplete) return;
    saveHealthyShipmentStatusProgress(run.id, run.businessIdentifier);
    completeMission(LEARN_THE_FLOW_MISSION_ID);
    setCompleted(true);
  }

  if (!run) {
    return (
      <section className="workstation-case-start" data-testid="healthy-workstation-page">
        <Link className="secondary-button training-back-link" to="/learn/desk">
          <ArrowLeft size={16} /> Training Desk
        </Link>
        <article className="panel workstation-case-brief healthy-workstation-brief">
          <div>
            <p className="eyebrow">Module 03 · Healthy Integration Lab</p>
            <h1>Learn the workstation on a shipment that works.</h1>
            <p>Run one real simulated shipment through FreightBridge before troubleshooting anything. No training failure is injected here; your job is to learn what healthy evidence looks like in Console, Code, and Answer.</p>
          </div>
          <div className="healthy-baseline-path" aria-label="Healthy integration path">
            <span>Apex REST + JSON</span><ArrowRight size={16} />
            <span>FreightBridge canonical</span><ArrowRight size={16} />
            <span>204 + SFTP</span><ArrowRight size={16} />
            <span>997 → 990</span><ArrowRight size={16} />
            <span>214 statuses</span>
          </div>
          <div className="workstation-prior-complete">
            <CheckCircle2 size={18} />
            <span>{completed ? 'Your healthy baseline completion is already saved. You can reopen the run for review.' : 'This lab establishes the baseline you will compare every later incident against.'}</span>
          </div>
          <button className="primary-button" type="button" onClick={startOrResume} disabled={working}>
            <Play size={16} />
            {working ? 'Opening healthy shipment…' : saved?.runId ? 'Resume Healthy Shipment' : 'Start Healthy Lab'}
          </button>
        </article>
        {error && <HealthyError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="healthy-workstation-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>

      {error && <HealthyError message={error} />}

      <LabWorkstation
        caseLabel="Module 03 · Healthy baseline"
        title={'Follow ' + run.businessIdentifier + ' end to end'}
        subtitle="Observe the normal message sequence first. Later incident labs use this same workstation and ask you to find the first point where the evidence diverges."
        statusLabel={runComplete ? 'Healthy baseline complete' : 'Healthy flow in progress'}
        statusTone={runComplete ? 'success' : 'neutral'}
        console={
          <HealthyConsole
            run={run}
            checkpoints={checkpoints}
            selected={selectedCheckpoint}
            selectedId={selectedCheckpointId}
            detailMode={detailMode}
            working={working}
            runComplete={runComplete}
            onSelect={(id) => {
              setSelectedCheckpointId(id);
              setDetailMode('processing');
            }}
            onDetailMode={setDetailMode}
            onRunNext={runNextCheckpoint}
          />
        }
        code={
          <HealthyCode
            activeFile={activeFile}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
          />
        }
        answer={
          <HealthyAnswer
            run={run}
            runComplete={runComplete}
            answers={answers}
            checksComplete={checksComplete}
            completed={completed}
            onAnswer={(questionId, optionId) => setAnswers((current) => ({ ...current, [questionId]: optionId }))}
            onComplete={finishHealthyLab}
          />
        }
      />

      {completed && (
        <article className="panel workstation-complete" data-testid="healthy-workstation-complete">
          <CheckCircle2 size={24} />
          <div>
            <p className="eyebrow">Healthy baseline complete</p>
            <h2>You now know what normal FreightBridge evidence looks like.</h2>
            <p>Mission 1 is recorded as complete. The next lab introduces the first controlled failure: Apex authentication.</p>
          </div>
          <Link className="primary-button" to="/learn/mission/apex-bad-auth">
            Start First Incident <ArrowRight size={16} />
          </Link>
        </article>
      )}
    </section>
  );
}

function HealthyConsole({
  run,
  checkpoints,
  selected,
  selectedId,
  detailMode,
  working,
  runComplete,
  onSelect,
  onDetailMode,
  onRunNext,
}: {
  run: LabRun;
  checkpoints: HealthyCheckpoint[];
  selected: HealthyCheckpoint;
  selectedId: string;
  detailMode: DetailMode;
  working: boolean;
  runComplete: boolean;
  onSelect: (id: string) => void;
  onDetailMode: (mode: DetailMode) => void;
  onRunNext: () => void;
}) {
  const completedCount = checkpoints.filter((checkpoint) => checkpoint.status === 'SUCCEEDED').length;
  return (
    <div className="workstation-console healthy-workstation-console" data-testid="healthy-workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Healthy integration log</span><strong>{run.businessIdentifier}</strong></div>
          <small>{completedCount} / {checkpoints.length} baseline checkpoints observed</small>
        </div>
        <div className="workstation-log-list">
          {checkpoints.map((checkpoint, index) => (
            <button
              key={checkpoint.id}
              className={'workstation-log-row ' + checkpoint.status.toLowerCase() + (checkpoint.id === selectedId ? ' selected' : '')}
              type="button"
              onClick={() => onSelect(checkpoint.id)}
              data-testid={'healthy-log-' + checkpoint.id}
            >
              <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="workstation-log-icon">{checkpoint.status === 'SUCCEEDED' ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span>
              <span className="workstation-log-copy">
                <strong>{checkpoint.title}</strong>
                <small>{checkpoint.source}</small>
              </span>
              <span className="workstation-log-status">{checkpoint.status}</span>
            </button>
          ))}
        </div>
        <div className={'healthy-console-runner ' + (runComplete ? 'complete' : '')}>
          {runComplete ? (
            <>
              <CheckCircle2 size={18} />
              <span><strong>No failure introduced.</strong> The shipment reached DELIVERED and the full baseline is available for inspection.</span>
            </>
          ) : (
            <>
              <div>
                <RotateCcw size={17} />
                <span><strong>Advance the real Lab run.</strong> Each execution reveals the next FreightBridge-observable checkpoint.</span>
              </div>
              <button className="primary-button" type="button" onClick={onRunNext} disabled={working}>
                {working ? 'Running…' : 'Run Next Checkpoint'} <ArrowRight size={15} />
              </button>
            </>
          )}
        </div>
      </section>

      <aside className="workstation-inspector">
        <div className="workstation-pane-heading">
          <div><span>Selected checkpoint</span><strong>{selected.title}</strong></div>
        </div>
        <dl className="workstation-inspector-grid">
          <div><dt>Status</dt><dd>{selected.status}</dd></div>
          <div><dt>Boundary</dt><dd>{selected.boundary}</dd></div>
          <div><dt>Protocol</dt><dd>{selected.protocol}</dd></div>
          <div><dt>Document</dt><dd>{selected.document}</dd></div>
        </dl>
        <div className="workstation-detail-toggle" role="group" aria-label="Healthy checkpoint evidence">
          <button className={detailMode === 'processing' ? 'active' : ''} type="button" onClick={() => onDetailMode('processing')}>View Processing Details</button>
          <button className={detailMode === 'raw' ? 'active' : ''} type="button" onClick={() => onDetailMode('raw')}>View Raw Message</button>
        </div>
        {detailMode === 'processing' ? (
          <div className="workstation-processing-detail" data-testid="healthy-processing-detail">
            <p>{selected.observed}</p>
            <small>{selected.meaning}</small>
            <dl>
              <div><dt>Format</dt><dd>{selected.format}</dd></div>
              <div><dt>Evidence source</dt><dd>{selected.source}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="workstation-raw" data-testid="healthy-raw-message">
            <div><FileJson2 size={16} /><span>FreightBridge-visible evidence</span></div>
            <pre>{rawEvidence(selected.raw)}</pre>
            <small>Only evidence available at FreightBridge's integration boundary is shown. Private Midwest internal logs are not inferred.</small>
          </div>
        )}
      </aside>
    </div>
  );
}

function HealthyCode({
  activeFile,
  activeFileId,
  onSelectFile,
}: {
  activeFile: CodeFile;
  activeFileId: string;
  onSelectFile: (id: string) => void;
}) {
  return (
    <div className="workstation-code" data-testid="healthy-workstation-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading"><div><span>Workspace</span><strong>Healthy Integration Reference</strong></div></div>
        <div className="workstation-file-list">
          {codeFiles.map((file) => (
            <button
              key={file.id}
              className={file.id === activeFileId ? 'active' : ''}
              type="button"
              onClick={() => onSelectFile(file.id)}
            >
              <FileCode2 size={14} /><span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="workstation-editor">
        <div className="workstation-editor-bar"><span>{activeFile.path}</span><small>Read only · baseline lab</small></div>
        <pre data-testid="healthy-code-content"><code>{activeFile.content}</code></pre>
      </section>
      <aside className="workstation-code-note">
        <Server size={19} />
        <strong>Why this file matters</strong>
        <p>{activeFile.note}</p>
      </aside>
    </div>
  );
}

function HealthyAnswer({
  run,
  runComplete,
  answers,
  checksComplete,
  completed,
  onAnswer,
  onComplete,
}: {
  run: LabRun;
  runComplete: boolean;
  answers: Record<string, string>;
  checksComplete: boolean;
  completed: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onComplete: () => void;
}) {
  return (
    <div className="workstation-answer" data-testid="healthy-workstation-answer">
      <div className="workstation-answer-intro">
        <span>Baseline check</span>
        <h2>Prove you can read a healthy integration before debugging one.</h2>
        <p>There is no root cause to diagnose here. Use the Console and Code views to confirm what each successful signal actually proves.</p>
      </div>

      <div className="healthy-proof-strip">
        <div><span>997 technical acknowledgment</span><strong>{text(run.resultSummary.technicalAcknowledgment)}</strong></div>
        <div><span>990 tender decision</span><strong>{text(run.resultSummary.tenderStatus)}</strong></div>
        <div><span>Shipment status</span><strong>{text(run.resultSummary.shipmentStatus)}</strong></div>
      </div>

      {!runComplete && (
        <div className="workstation-answer-hint">
          <AlertTriangle size={18} />
          <p>Finish the Console sequence before completing the baseline check. You can inspect the questions now, but the answers are grounded in the completed healthy run.</p>
        </div>
      )}

      {questions.map((question) => {
        const selected = answers[question.id];
        const correct = selected === question.correct;
        return (
          <fieldset className="workstation-options" key={question.id}>
            <legend>{question.prompt}</legend>
            {question.options.map((option) => (
              <label key={option.id} className={selected === option.id ? 'selected' : ''}>
                <input
                  type="radio"
                  name={'healthy-' + question.id}
                  value={option.id}
                  checked={selected === option.id}
                  disabled={!runComplete}
                  onChange={() => onAnswer(question.id, option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {selected && (
              <div className={'workstation-option-feedback ' + (correct ? 'correct' : 'incorrect')}>
                {correct ? 'Correct. This is a healthy baseline signal.' : 'Evidence hint: ' + question.hint}
              </div>
            )}
          </fieldset>
        );
      })}

      {checksComplete && runComplete && (
        <div className="workstation-diagnosis-confirmed">
          <CheckCircle2 size={20} />
          <div>
            <strong>Healthy baseline confirmed</strong>
            <p>You separated transport from business outcome, identified the 990 as the tender decision, and read the 214 status map correctly.</p>
          </div>
        </div>
      )}

      <button
        className="primary-button workstation-complete-button"
        type="button"
        disabled={!runComplete || !checksComplete || completed}
        onClick={onComplete}
      >
        <CheckCircle2 size={16} />
        {completed ? 'Healthy Lab Complete' : 'Complete Healthy Lab'}
      </button>
    </div>
  );
}

function HealthyError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div>
        <h2>Healthy baseline hit an unexpected system issue.</h2>
        <p>{message}</p>
      </div>
    </article>
  );
}

function buildHealthyCheckpoints(run: LabRun | null): HealthyCheckpoint[] {
  const canonical = findCanonicalShipment(run);
  const preview204 = find204Preview(run);
  const events = shipmentEvents(run);
  const ackDetail = asRecord(run?.resultSummary.technicalAcknowledgmentDetail) ?? {};
  const technicalAck = text(run?.resultSummary.technicalAcknowledgment);
  const tenderStatus = text(run?.resultSummary.tenderStatus);
  const finalStatus = text(run?.resultSummary.shipmentStatus);
  const finalRun = run?.status === 'SUCCEEDED';

  function event(status: string) {
    return events.find((item) => item.status === status) ?? null;
  }

  function succeeded(value: boolean): HealthyStatus {
    return value ? 'SUCCEEDED' : 'PENDING';
  }

  const statusRows: Array<[string, string, string, string]> = [
    ['pickup', 'PICKED_UP', 'AF', 'FreightBridge received the pickup event and normalized AF to PICKED_UP.'],
    ['transit', 'IN_TRANSIT', 'X6', 'FreightBridge received the in-transit event and normalized X6 to IN_TRANSIT.'],
    ['arrived', 'ARRIVED', 'X1', 'FreightBridge received the arrival event and normalized X1 to ARRIVED.'],
    ['delivered', 'DELIVERED', 'D1', 'FreightBridge received the delivery event and normalized D1 to DELIVERED.'],
  ];

  return [
    {
      id: 'apex',
      title: 'Apex REST tender received',
      source: 'FreightBridge inbound API',
      status: succeeded(Boolean(run && (Object.keys(canonical).length > 0 || findStep(run, 'DISPATCH_APEX_TENDER')?.status === 'SUCCEEDED' || finalRun))),
      boundary: 'Apex → FreightBridge',
      protocol: 'REST / HTTP',
      format: 'JSON',
      document: 'Load Tender',
      observed: 'FreightBridge received the Apex load request and could begin inbound processing.',
      meaning: 'A healthy inbound request reaches FreightBridge before any Midwest X12 work starts.',
      raw: findApexPayload(run),
    },
    {
      id: 'canonical',
      title: 'Canonical shipment created',
      source: 'FreightBridge normalization',
      status: succeeded(Object.keys(canonical).length > 0),
      boundary: 'Inside FreightBridge',
      protocol: 'Internal processing',
      format: 'Canonical model',
      document: 'Canonical Shipment',
      observed: 'The partner-specific Apex payload was normalized into FreightBridge shipment data.',
      meaning: 'Later partner mappings can now work from one internal business model.',
      raw: canonical,
    },
    {
      id: '204',
      title: 'X12 204 delivered to Midwest',
      source: 'FreightBridge outbound mapping + SFTP',
      status: succeeded(Boolean(preview204 || findStep(run, 'DISPATCH_204_SFTP')?.status === 'SUCCEEDED' || finalRun)),
      boundary: 'FreightBridge → Midwest',
      protocol: 'SFTP',
      format: 'X12 004010',
      document: '204 Load Tender',
      observed: 'FreightBridge mapped the canonical shipment into a Midwest 204 and delivered the file through SFTP.',
      meaning: 'This proves document generation and transport. It does not prove Midwest accepted the load.',
      raw: preview204 ?? findStep(run, 'DISPATCH_204_SFTP')?.responseSummary ?? {},
    },
    {
      id: '997',
      title: '997 technical acknowledgment received',
      source: 'FreightBridge inbound SFTP',
      status: succeeded(technicalAck === 'ACCEPTED'),
      boundary: 'Midwest → FreightBridge',
      protocol: 'SFTP',
      format: 'X12 004010',
      document: '997 Functional Acknowledgment',
      observed: technicalAck === 'ACCEPTED'
        ? 'FreightBridge recorded an accepted 997 for the tender transaction.'
        : 'The technical acknowledgment has not been received yet.',
      meaning: 'A 997 is technical acknowledgment only. It is not the carrier tender decision.',
      raw: Object.keys(ackDetail).length > 0 ? ackDetail : findStep(run, 'FREIGHTBRIDGE_RECEIVE_997')?.responseSummary ?? {},
    },
    {
      id: '990',
      title: '990 tender response accepted',
      source: 'FreightBridge inbound SFTP',
      status: succeeded(tenderStatus === 'ACCEPTED'),
      boundary: 'Midwest → FreightBridge',
      protocol: 'SFTP',
      format: 'X12 004010',
      document: '990 Tender Response',
      observed: tenderStatus === 'ACCEPTED'
        ? 'FreightBridge recorded Midwest accepting the tender.'
        : 'The carrier business decision has not been received yet.',
      meaning: 'The 990 is the business answer to the 204 tender.',
      raw: findStep(run, 'FREIGHTBRIDGE_RECEIVE_990')?.responseSummary ?? { tenderStatus: run?.resultSummary.tenderStatus ?? 'PENDING' },
    },
    ...statusRows.map(([id, status, code, observed]) => {
      const eventEvidence = event(status);
      return {
        id: '214-' + id,
        title: status + ' 214 processed',
        source: 'FreightBridge shipment-status processing',
        status: succeeded(Boolean(eventEvidence || (status === 'DELIVERED' && finalStatus === 'DELIVERED'))),
        boundary: 'Midwest → FreightBridge',
        protocol: 'SFTP',
        format: 'X12 004010',
        document: '214 Shipment Status',
        observed,
        meaning: code + ' → ' + status + ' in the active Midwest status mapping.',
        raw: eventEvidence ?? findStep(run, 'FREIGHTBRIDGE_RECEIVE_214_' + status)?.responseSummary ?? { status, at7Code: code },
      };
    }),
  ];
}

function isHealthyRunComplete(run: LabRun | null): boolean {
  if (!run) return false;
  return run.status === 'SUCCEEDED'
    || (
      run.resultSummary.technicalAcknowledgment === 'ACCEPTED'
      && run.resultSummary.tenderStatus === 'ACCEPTED'
      && run.resultSummary.shipmentStatus === 'DELIVERED'
    );
}

function lastCompletedCheckpointId(run: LabRun): string {
  const completed = buildHealthyCheckpoints(run).filter((checkpoint) => checkpoint.status === 'SUCCEEDED');
  return completed.length > 0 ? completed[completed.length - 1].id : 'apex';
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'PENDING';
  return String(value);
}

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
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { IncidentEvidencePoint, IncidentMissionDefinition, IncidentOption } from '../training/types';

type DetailMode = 'processing' | 'raw';
type CodeFile = { id: string; path: string; language: string; content: string };

const codeFiles: CodeFile[] = [
  {
    id: 'apex-contract',
    path: 'Partner Contracts/apex_contract.json',
    language: 'json',
    content: `{
  "partnerCode": "APEX",
  "transport": "REST",
  "messageFormat": "JSON",
  "authentication": {
    "scheme": "Bearer",
    "requirement": "valid environment credential"
  },
  "inboundDocument": "Load Tender"
}`,
  },
  {
    id: 'inbound-pipeline',
    path: 'Validation/inbound_pipeline.ts',
    language: 'typescript',
    content: `export function processApexTender(request) {
  recordInboundRequest(request);
  authenticatePartner(request.headers);
  const payload = parseJson(request.body);
  validateApexLoad(payload);
  return createCanonicalShipment(payload);
}`,
  },
  {
    id: 'mapping',
    path: 'Mappings/apex_to_canonical.ts',
    language: 'typescript',
    content: `export function apexToCanonical(payload) {
  return {
    shipmentNumber: payload.loadId,
    origin: payload.pickup,
    destination: payload.delivery,
    equipmentType: payload.equipmentType,
  };
}

// Mapping is reached only after authentication,
// parsing, and contract validation succeed.`,
  },
  {
    id: 'boundary',
    path: 'Reference/evidence_boundary.md',
    language: 'markdown',
    content: `FreightBridge can prove what reached its own integration boundary.

For Apex inbound traffic, investigate in order:
1. Request arrival
2. Partner authentication
3. JSON parsing
4. Contract validation
5. Canonical shipment creation

Do not infer Apex's private token-generation logic from FreightBridge evidence.`,
  },
];

export function ApexBadAuthWorkstation({ mission }: { mission: IncidentMissionDefinition }) {
  const { token, handleApiError } = useOperationsSession();
  const [incidentRun, setIncidentRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(mission.evidencePoints[0]?.id ?? '');
  const [detailMode, setDetailMode] = useState<DetailMode>('processing');
  const [activeFileId, setActiveFileId] = useState(codeFiles[0].id);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const alreadyCompleted = hasCompletedMission(loadTrainingProgress(), mission.id);
  const failureDrill = useMemo(() => readRecord(incidentRun?.resultSummary.failureDrill), [incidentRun]);
  const observed = readRecord(failureDrill?.observed);
  const payloadPreview = failureDrill?.payloadPreview ?? {};
  const selectedEvidence =
    mission.evidencePoints.find((point) => point.id === selectedEvidenceId)
    ?? mission.evidencePoints[0];
  const activeFile = codeFiles.find((file) => file.id === activeFileId) ?? codeFiles[0];
  const diagnosisCorrect = diagnosisId === mission.correctDiagnosisId;
  const planCorrect = planId === mission.correctPlanId;
  const answerAttempted = diagnosisId !== null || planId !== null;
  const verified = Boolean(
    incidentRun
    && recoveryRun
    && recoveryRun.status === 'SUCCEEDED'
    && recoveryRun.businessIdentifier === incidentRun.businessIdentifier,
  );

  async function startIncident() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setIncidentRun(null);
    setRecoveryRun(null);
    setDiagnosisId(null);
    setPlanId(null);
    setCompleted(false);
    setSelectedEvidenceId(mission.evidencePoints[0]?.id ?? '');
    setDetailMode('processing');
    try {
      let nextRun = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: generateLoadId(),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Training Incident Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 10) {
        const executed = await runNextLabStep(token, nextRun.id);
        nextRun = executed.run;
        guard += 1;
      }
      if (nextRun.status !== 'SUCCEEDED') {
        throw new Error('Controlled authentication drill did not reach its expected observed-failure result.');
      }
      setIncidentRun(nextRun);
      const failedPoint = mission.evidencePoints.find((point) => point.status === 'FAILED');
      if (failedPoint) setSelectedEvidenceId(failedPoint.id);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The incident drill could not be started.');
    } finally {
      setWorking(false);
    }
  }

  function applyFixAndRunAgain() {
    if (!incidentRun || !diagnosisCorrect || !planCorrect) return;
    setError(null);
    setRecoveryRun(buildTrainingRecoveryRun(incidentRun));
  }

  function finishLab() {
    if (!verified) return;
    completeMission(mission.id);
    setCompleted(true);
  }

  if (completed) {
    return (
      <section className="workstation-case-page" data-testid="incident-mission-page">
        <article className="panel workstation-complete" data-testid="incident-summary">
          <CheckCircle2 size={24} />
          <div>
            <p className="eyebrow">Lab complete</p>
            <h2>Authentication failure diagnosed and recovered.</h2>
            <p>The request reached FreightBridge, authentication failed first, and the same load completed successfully after a valid authenticated retry.</p>
          </div>
          <div className="workstation-complete-actions">
            <Link className="primary-button" to="/learn/mission/apex-invalid-json">
              Continue to Mission 3 <ArrowRight size={16} />
            </Link>
          </div>
        </article>
      </section>
    );
  }

  if (!incidentRun) {
    return (
      <section className="workstation-case-start" data-testid="incident-mission-page">
        <Link className="secondary-button training-back-link" to="/learn/desk">
          <ArrowLeft size={16} /> Training Desk
        </Link>
        <article className="panel workstation-case-brief">
          <div>
            <p className="eyebrow">Mission {mission.missionNumber} · Workstation Pilot</p>
            <h1>{mission.title.replace(/^Mission \d+ - /, '')}</h1>
            <p>{mission.symptom}</p>
          </div>
          <div className="workstation-brief-messages">
            <div><span>Manager briefing</span><p>{mission.briefing.body}</p></div>
            <div><span>Partner report</span><p>{mission.partnerMessage.body}</p></div>
          </div>
          {alreadyCompleted && (
            <div className="workstation-prior-complete">
              <CheckCircle2 size={18} />
              Your previous completion is preserved. Start a fresh drill to review the new workstation.
            </div>
          )}
          <button className="primary-button" type="button" onClick={startIncident} disabled={working}>
            <Play size={16} /> {working ? 'Starting incident…' : alreadyCompleted ? 'Replay in Workstation' : 'Start Incident'}
          </button>
        </article>
        {error && <WorkstationError message={error} />}
      </section>
    );
  }

  return (
    <section
      className="workstation-case-page"
      data-testid="incident-mission-page"
    >
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>

      {error && <WorkstationError message={error} />}

      <div data-testid="incident-workspace" data-scenario-key={mission.scenarioKey}>
        <LabWorkstation
          caseLabel={'Mission ' + mission.missionNumber + ' · Guided incident'}
          title={mission.title.replace(/^Mission \d+ - /, '')}
          subtitle={mission.symptom}
          statusLabel={verified ? 'Recovery verified' : 'Processing stopped'}
          console={
            <ConsoleView
              mission={mission}
              run={incidentRun}
              observed={observed}
              payloadPreview={payloadPreview}
              selectedEvidence={selectedEvidence}
              selectedEvidenceId={selectedEvidenceId}
              detailMode={detailMode}
              onSelectEvidence={(id) => {
                setSelectedEvidenceId(id);
                setDetailMode('processing');
              }}
              onDetailMode={setDetailMode}
            />
          }
          code={
            <CodeView
              activeFile={activeFile}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
            />
          }
          answer={
            <AnswerView
              mission={mission}
              diagnosisId={diagnosisId}
              planId={planId}
              diagnosisCorrect={diagnosisCorrect}
              planCorrect={planCorrect}
              answerAttempted={answerAttempted}
              recoveryRun={recoveryRun}
              verified={verified}
              working={working}
              completed={completed}
              onDiagnosis={setDiagnosisId}
              onPlan={setPlanId}
              onRecover={applyFixAndRunAgain}
              onComplete={finishLab}
            />
          }
        />
      </div>
    </section>
  );
}

function ConsoleView({
  mission,
  run,
  observed,
  payloadPreview,
  selectedEvidence,
  selectedEvidenceId,
  detailMode,
  onSelectEvidence,
  onDetailMode,
}: {
  mission: IncidentMissionDefinition;
  run: LabRun;
  observed: Record<string, unknown>;
  payloadPreview: unknown;
  selectedEvidence: IncidentEvidencePoint | undefined;
  selectedEvidenceId: string;
  detailMode: DetailMode;
  onSelectEvidence: (id: string) => void;
  onDetailMode: (mode: DetailMode) => void;
}) {
  return (
    <div className="workstation-console" data-testid="workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>Integration log</span><strong>{run.businessIdentifier}</strong></div>
          <small>Sequence stops at the first failed checkpoint.</small>
        </div>
        <div className="workstation-log-list">
          {mission.evidencePoints.map((point, index) => (
            <button
              key={point.id}
              className={'workstation-log-row ' + point.status.toLowerCase().replace('_', '-') + (point.id === selectedEvidenceId ? ' selected' : '')}
              type="button"
              onClick={() => onSelectEvidence(point.id)}
              data-testid={'workstation-log-' + point.id}
            >
              <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="workstation-log-icon">{statusIcon(point.status)}</span>
              <span className="workstation-log-copy">
                <strong>{point.checkpoint}</strong>
                <small>{point.source}</small>
              </span>
              <span className="workstation-log-status">{statusLabel(point.status)}</span>
            </button>
          ))}
        </div>
        <div className="workstation-stop-banner">
          <XCircle size={17} />
          Processing stopped at Partner authentication. Later checkpoints were not reached.
        </div>
      </section>

      <aside className="workstation-inspector">
        <div className="workstation-pane-heading">
          <div><span>Selected checkpoint</span><strong>{selectedEvidence?.checkpoint ?? 'Choose a log row'}</strong></div>
        </div>
        {selectedEvidence && (
          <>
            <dl className="workstation-inspector-grid">
              <div><dt>Status</dt><dd>{statusLabel(selectedEvidence.status)}</dd></div>
              <div><dt>Boundary</dt><dd>{selectedEvidence.id === 'received' ? 'Apex → FreightBridge' : 'FreightBridge processing'}</dd></div>
              <div><dt>Protocol</dt><dd>{selectedEvidence.id === 'received' || selectedEvidence.id === 'authentication' ? 'REST / HTTP' : 'Internal'}</dd></div>
              <div><dt>Document</dt><dd>Apex Load Tender · JSON</dd></div>
            </dl>
            <div className="workstation-detail-toggle" role="group" aria-label="Selected checkpoint evidence">
              <button className={detailMode === 'processing' ? 'active' : ''} type="button" onClick={() => onDetailMode('processing')}>View Processing Details</button>
              <button className={detailMode === 'raw' ? 'active' : ''} type="button" onClick={() => onDetailMode('raw')}>View Raw Message</button>
            </div>
            {detailMode === 'processing' ? (
              <div className="workstation-processing-detail" data-testid="workstation-processing-detail">
                <p>{selectedEvidence.observed}</p>
                <small>{selectedEvidence.meaning}</small>
                {selectedEvidence.status === 'FAILED' && (
                  <dl>
                    <div><dt>Error code</dt><dd>{String(observed.errorCode ?? 'AUTHENTICATION_ERROR')}</dd></div>
                    <div><dt>Stage</dt><dd>{String(observed.stage ?? 'AUTHENTICATION')}</dd></div>
                    <div><dt>Category</dt><dd>{String(observed.category ?? 'AUTHENTICATION_ERROR')}</dd></div>
                  </dl>
                )}
              </div>
            ) : (
              <div className="workstation-raw" data-testid="workstation-raw-message">
                <div><FileJson2 size={16} /><span>Sanitized request evidence</span></div>
                <pre>{JSON.stringify(payloadPreview, null, 2)}</pre>
                <small>Authentication values are redacted. FreightBridge never exposes partner secrets in training evidence.</small>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function CodeView({
  activeFile,
  activeFileId,
  onSelectFile,
}: {
  activeFile: CodeFile;
  activeFileId: string;
  onSelectFile: (id: string) => void;
}) {
  return (
    <div className="workstation-code" data-testid="workstation-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading"><div><span>Workspace</span><strong>FreightBridge Integration</strong></div></div>
        <div className="workstation-file-list">
          {codeFiles.map((file) => (
            <button
              key={file.id}
              className={file.id === activeFileId ? 'active' : ''}
              type="button"
              onClick={() => onSelectFile(file.id)}
            >
              <FileCode2 size={14} />
              <span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="workstation-editor">
        <div className="workstation-editor-bar">
          <span>{activeFile.path}</span>
          <small>Read only · guided lab</small>
        </div>
        <pre data-testid="workstation-code-content"><code>{activeFile.content}</code></pre>
      </section>
      <aside className="workstation-code-note">
        <Server size={19} />
        <strong>What should you compare?</strong>
        <p>The Console says authentication failed before parsing. Use the contract and pipeline order to decide whether JSON mapping could be the root cause.</p>
      </aside>
    </div>
  );
}

function AnswerView({
  mission,
  diagnosisId,
  planId,
  diagnosisCorrect,
  planCorrect,
  answerAttempted,
  recoveryRun,
  verified,
  working,
  completed,
  onDiagnosis,
  onPlan,
  onRecover,
  onComplete,
}: {
  mission: IncidentMissionDefinition;
  diagnosisId: string | null;
  planId: string | null;
  diagnosisCorrect: boolean;
  planCorrect: boolean;
  answerAttempted: boolean;
  recoveryRun: LabRun | null;
  verified: boolean;
  working: boolean;
  completed: boolean;
  onDiagnosis: (id: string) => void;
  onPlan: (id: string) => void;
  onRecover: () => void;
  onComplete: () => void;
}) {
  const selectedDiagnosis = mission.diagnosisOptions.find((option) => option.id === diagnosisId);
  const selectedPlan = mission.planOptions.find((option) => option.id === planId);
  const correct = diagnosisCorrect && planCorrect;

  return (
    <div className="workstation-answer" data-testid="workstation-answer">
      <div className="workstation-answer-intro">
        <span>Diagnosis</span>
        <h2>Use the evidence, not the symptom.</h2>
        <p>Choose the root cause and the safest recovery. If either is wrong, use the hint to return to the evidence.</p>
      </div>

      <OptionGroup
        legend="What caused this incident?"
        options={mission.diagnosisOptions}
        selectedId={diagnosisId}
        onSelect={onDiagnosis}
      />
      {selectedDiagnosis && <OptionFeedback option={selectedDiagnosis} correct={diagnosisCorrect} />}

      <OptionGroup
        legend="What should FreightBridge do next?"
        options={mission.planOptions}
        selectedId={planId}
        onSelect={onPlan}
      />
      {selectedPlan && <OptionFeedback option={selectedPlan} correct={planCorrect} />}

      {answerAttempted && !correct && (
        <div className="workstation-answer-hint">
          <AlertTriangle size={18} />
          <div>
            <strong>Evidence hint</strong>
            <p>The request arrived, but authentication is the first failed checkpoint. JSON parsing and all Midwest work are marked NOT REACHED.</p>
          </div>
        </div>
      )}

      {correct && !verified && (
        <div className="workstation-diagnosis-confirmed">
          <CheckCircle2 size={20} />
          <div>
            <strong>Diagnosis confirmed</strong>
            <p>FreightBridge rejected the Apex identity before parsing the body. The safe fix is a fresh authenticated retry, not a downstream workaround.</p>
          </div>
          <button className="primary-button" type="button" onClick={onRecover} disabled={working}>
            <RotateCcw size={16} /> {working ? 'Running recovery…' : 'Apply Fix & Run Again'}
          </button>
        </div>
      )}

      {recoveryRun && (
        <div className={'workstation-verification ' + (verified ? 'success' : 'failed')} data-testid="verification-panel">
          {verified ? <CheckCircle2 size={21} /> : <XCircle size={21} />}
          <div>
            <span>Verification</span>
            <strong>{verified ? 'SUCCEEDED · training verification' : 'Recovery not verified'}</strong>
            <p>
              {verified
                ? 'The corrected authenticated retry is simulated for this guided lesson. The same business identifier is preserved, and no second Apex load is created.'
                : 'The training verification did not produce the expected corrected result.'}
            </p>
          </div>
        </div>
      )}

      {verified && !completed && (
        <button className="primary-button workstation-complete-button" type="button" onClick={onComplete}>
          <CheckCircle2 size={16} /> Complete Lab
        </button>
      )}
    </div>
  );
}

function OptionGroup({
  legend,
  options,
  selectedId,
  onSelect,
}: {
  legend: string;
  options: IncidentOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="workstation-options">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className={selectedId === option.id ? 'selected' : ''}>
          <input
            type="radio"
            name={legend}
            checked={selectedId === option.id}
            onChange={() => onSelect(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function OptionFeedback({ option, correct }: { option: IncidentOption; correct: boolean }) {
  return <div className={'workstation-option-feedback ' + (correct ? 'correct' : 'incorrect')}>{option.explanation}</div>;
}

function buildTrainingRecoveryRun(incidentRun: LabRun): LabRun {
  const now = new Date().toISOString();
  return {
    ...incidentRun,
    id: incidentRun.id + '-training-verification',
    scenarioKey: 'TRAINING_VERIFICATION',
    status: 'SUCCEEDED',
    resultSummary: {
      ...incidentRun.resultSummary,
      technicalAcknowledgment: 'ACCEPTED',
      tenderStatus: 'ACCEPTED',
      shipmentStatus: 'DELIVERED',
      trainingVerification: true,
    },
    updatedAt: now,
    completedAt: now,
    steps: [],
  };
}

function WorkstationError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div><h2>The training lab hit an unexpected system failure.</h2><p>{message}</p></div>
    </article>
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function statusIcon(status: IncidentEvidencePoint['status']) {
  if (status === 'SUCCEEDED') return <CheckCircle2 size={17} />;
  if (status === 'FAILED') return <XCircle size={17} />;
  return <Circle size={17} />;
}

function statusLabel(status: IncidentEvidencePoint['status']) {
  return status === 'NOT_REACHED' ? 'NOT REACHED' : status;
}

function generateLoadId() {
  return ('LABAUTH' + Date.now().toString(36).toUpperCase()).slice(0, 30);
}

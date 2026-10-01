import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode2,
  FileJson2,
  ListTree,
  Network,
  Play,
  Server,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, recoverLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import { AnalystNotes } from '../components/training/TrainingComponents';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import { trainingMissions } from '../training/missions';
import type {
  IncidentEvidencePoint,
  IncidentEvidenceSource,
  IncidentMissionDefinition,
  IncidentOption,
} from '../training/types';

type DetailMode = 'processing' | 'raw';

type CodeFile = {
  id: string;
  path: string;
  language: string;
  content: string;
  note: string;
};

const COMMON_PIPELINE = `Apex REST request
  -> authentication
  -> JSON parsing
  -> Apex contract validation
  -> canonical shipment
  -> Midwest 204
  -> SFTP
  -> 997 / 990
  -> 214 status
  -> Apex-facing update`;

const FILES_BY_SCENARIO: Record<string, CodeFile[]> = {
  APEX_INVALID_JSON: [
    {
      id: 'pipeline',
      path: 'Validation/inbound_pipeline.ts',
      language: 'typescript',
      content: `export function processApexTender(request) {
  recordInboundRequest(request);
  authenticatePartner(request.headers);
  const payload = parseJson(request.body);
  validateApexLoad(payload);
  return createCanonicalShipment(payload);
}`,
      note: 'Authentication succeeds before parseJson runs. If parsing fails, contract validation never starts.',
    },
    {
      id: 'parser',
      path: 'Validation/json_parser.ts',
      language: 'typescript',
      content: `export function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    throw integrationError('INVALID_JSON', 'PARSING');
  }
}`,
      note: 'This mission fails while converting request text into structured JSON data.',
    },
    {
      id: 'reference',
      path: 'Reference/inbound_order.md',
      language: 'markdown',
      content: COMMON_PIPELINE,
      note: 'Use processing order to distinguish request arrival, authentication, parsing, and validation.',
    },
  ],
  APEX_INVALID_CONTRACT: [
    {
      id: 'contract',
      path: 'Partner Contracts/apex_load_tender.json',
      language: 'json',
      content: `{
  "required": [
    "loadId",
    "equipmentType",
    "weightLbs",
    "pickup.postalCode",
    "delivery.postalCode"
  ]
}`,
      note: 'Valid JSON can still fail if a required business field is missing or unusable.',
    },
    {
      id: 'validation',
      path: 'Validation/apex_contract.ts',
      language: 'typescript',
      content: `export function validateApexLoad(payload) {
  requireValue(payload.loadId);
  requireValue(payload.pickup.postalCode);
  requireValue(payload.delivery.postalCode);
  requirePositive(payload.weightLbs);
}`,
      note: 'The parser already succeeded. This layer checks whether the load obeys the Apex business contract.',
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
  };
}

// This function is reached only after contract validation succeeds.`,
      note: 'A contract failure happens before the payload is allowed into canonical mapping.',
    },
  ],
  APEX_DUPLICATE_SHIPMENT: [
    {
      id: 'correlation',
      path: 'Processing/business_correlation.ts',
      language: 'typescript',
      content: `const existing = findShipmentByBusinessId(payload.loadId);
if (existing) {
  return evaluateReplay(existing, request);
}`,
      note: 'The repeated request uses the same business identifier as an already established shipment.',
    },
    {
      id: 'idempotency',
      path: 'Processing/idempotency.ts',
      language: 'typescript',
      content: `export function evaluateReplay(existing, request) {
  if (request.idempotencyKeyMatchesPriorRequest) {
    return priorResult(existing);
  }
  throw integrationError('DUPLICATE_SHIPMENT', 'DUPLICATE_PROTECTION');
}`,
      note: 'Safe replay reuses the prior business result. An unprotected duplicate must not create a second shipment or 204.',
    },
    {
      id: 'reference',
      path: 'Reference/replay_vs_duplicate.md',
      language: 'markdown',
      content: `Same business ID + recognized idempotency key
= safe replay of prior result

Same business ID without safe replay marker
= duplicate business attempt; block duplicate downstream work`,
      note: 'The key question is whether the second request is a safe replay or a new duplicate business effect.',
    },
  ],
  X12_214_CONTROL_MISMATCH: [
    {
      id: 'parser',
      path: 'Validation/x12_transaction_controls.ts',
      language: 'typescript',
      content: `export function validateTransactionControls(st02, se02) {
  if (st02 !== se02) {
    throw integrationError('X12_CONTROL_MISMATCH', 'PARSING');
  }
}`,
      note: 'ST02 starts the transaction with a control number. SE02 must repeat that same number.',
    },
    {
      id: 'example',
      path: 'Reference/214_control_example.edi',
      language: 'x12',
      content: `ST*214*1234~
B10*MWC900500*LOAD500*MWCX~
AT7*AF****20260924*1500*UT~
SE*7*9999~`,
      note: 'Here ST02 is 1234 while SE02 is 9999. FreightBridge must reject the transaction before mapping.',
    },
    {
      id: 'reference',
      path: 'Reference/x12_layers.md',
      language: 'markdown',
      content: `SFTP arrival proves the file reached FreightBridge.
It does NOT prove the X12 transaction parsed successfully.

ST = transaction starts
SE = transaction ends
ST02 must equal SE02`,
      note: 'Transport success and X12 parsing success are different checkpoints.',
    },
  ],
  X12_214_UNSUPPORTED_STATUS: [
    {
      id: 'status-map',
      path: 'Mappings/midwest_214_status_map.ts',
      language: 'typescript',
      content: `export const statusMap = {
  AF: 'PICKED_UP',
  X6: 'IN_TRANSIT',
  X1: 'ARRIVED',
  D1: 'DELIVERED',
};`,
      note: 'ZZ is absent. Structurally valid X12 can still fail because its business value is unsupported.',
    },
    {
      id: 'mapper',
      path: 'Mappings/midwest_214.ts',
      language: 'typescript',
      content: `export function map214(at7Code) {
  const status = statusMap[at7Code];
  if (!status) {
    throw integrationError('UNSUPPORTED_AT7_CODE', 'MAPPING');
  }
  return status;
}`,
      note: 'The failure happens after parsing, at semantic status mapping.',
    },
    {
      id: 'reference',
      path: 'Reference/214_status_example.edi',
      language: 'x12',
      content: `ST*214*5678~
B10*MWC900500*LOAD500*MWCX~
AT7*ZZ****20260924*1500*UT~
SE*7*5678~`,
      note: 'The transaction controls match, but AT7-01 contains ZZ, which the active mapping does not support.',
    },
  ],
};

export function GuidedIncidentWorkstation({ mission }: { mission: IncidentMissionDefinition }) {
  const { token, handleApiError } = useOperationsSession();
  const [incidentRun, setIncidentRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(mission.evidencePoints[0]?.id ?? '');
  const [detailMode, setDetailMode] = useState<DetailMode>('processing');
  const [activeFileId, setActiveFileId] = useState(() => guidedFiles(mission)[0]?.id ?? '');
  const [lastHealthyId, setLastHealthyId] = useState<string | null>(null);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [inspectedEvidenceIds, setInspectedEvidenceIds] = useState<string[]>([]);
  const [statusUpdate, setStatusUpdate] = useState('');
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
  const files = guidedFiles(mission);
  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];
  const requiredEvidenceIds = mission.requiredEvidenceSourceIds ?? [];
  const requiredEvidenceInspected = requiredEvidenceIds.every((id) => inspectedEvidenceIds.includes(id));
  const lastHealthyCorrect = lastHealthyId === mission.correctLastHealthyId;
  const diagnosisCorrect = diagnosisId === mission.correctDiagnosisId;
  const planCorrect = planId === mission.correctPlanId;
  const recovery = readRecord(recoveryRun?.resultSummary.recovery);
  const verified = recoveryVerified(mission, incidentRun, recoveryRun, recovery);
  const canComplete =
    lastHealthyCorrect
    && diagnosisCorrect
    && planCorrect
    && verified;
  const currentMissionIndex = trainingMissions.findIndex((candidate) => candidate.id === mission.id);
  const nextMission = currentMissionIndex >= 0 ? trainingMissions[currentMissionIndex + 1] : undefined;
  const nextMissionPath = nextMission ? '/learn/mission/' + nextMission.slug : '/learn/desk';
  const nextMissionLabel = nextMission
    ? mission.missionNumber === 7
      ? 'Continue to Module 05'
      : 'Continue to Mission ' + (mission.missionNumber + 1)
    : 'Return to Training Desk';

  async function startIncident() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setIncidentRun(null);
    setRecoveryRun(null);
    setLastHealthyId(null);
    setDiagnosisId(null);
    setPlanId(null);
    setInspectedEvidenceIds([]);
    setStatusUpdate('');
    setCompleted(false);
    setSelectedEvidenceId(mission.evidencePoints[0]?.id ?? '');
    setDetailMode('processing');
    setActiveFileId(files[0]?.id ?? '');

    try {
      let nextRun = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: generateIncidentLoadId(mission.missionNumber),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Training Incident Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 12) {
        const result = await runNextLabStep(token, nextRun.id);
        nextRun = result.run;
        guard += 1;
      }
      if (nextRun.status !== 'SUCCEEDED') {
        throw new Error('Controlled incident drill did not reach its expected observed-failure result.');
      }
      setIncidentRun(nextRun);
      const failed = mission.evidencePoints.find((point) => point.status === 'FAILED');
      if (failed) setSelectedEvidenceId(failed.id);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The incident drill could not be started.');
    } finally {
      setWorking(false);
    }
  }

  async function applyFixAndRunAgain() {
    if (!incidentRun || !lastHealthyCorrect || !diagnosisCorrect || !planCorrect || !requiredEvidenceInspected) return;

    if (mission.missionNumber < 5) {
      setError(null);
      setRecoveryRun(buildTrainingRecoveryRun(incidentRun));
      return;
    }

    if (!token) return;
    setWorking(true);
    setError(null);
    setRecoveryRun(null);

    try {
      const nextRun = await recoverLabRun(token, incidentRun.id);
      setRecoveryRun(nextRun);
      if (!recoveryVerified(mission, incidentRun, nextRun, readRecord(nextRun.resultSummary.recovery))) {
        setError('The retry did not produce the recovery evidence required for this incident.');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The recovery retry could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function finishMission() {
    if (!canComplete) return;
    completeMission(mission.id);
    setCompleted(true);
  }

  if (completed) {
    return (
      <section className="workstation-case-page" data-testid="incident-mission-page">
        <article className="panel workstation-complete" data-testid="incident-summary">
          <CheckCircle2 size={24} />
          <div>
            <p className="eyebrow">Guided incident complete</p>
            <h2>{mission.shortTitle} recovered.</h2>
            <p>
              {mission.missionNumber >= 5
                ? 'FreightBridge verified the correction with the same load correlated through the recovery evidence.'
                : 'FreightBridge verified a corrected same-load retry through the healthy lifecycle.'}
            </p>
          </div>
          <div className="workstation-complete-actions">
            <Link className="primary-button" to={nextMissionPath}>
              {nextMissionLabel} <ArrowRight size={16} />
            </Link>
          </div>
        </article>
        <article className="panel guided-incident-debrief" data-testid="incident-debrief">
          <p className="eyebrow">MISSION COMPLETE</p>
          <h2>What to remember</h2>
          {mission.debrief.map((item) => <p key={item}>{item}</p>)}
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
            <p className="eyebrow">Mission {mission.missionNumber} · Guided troubleshooting</p>
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
              Your previous completion is preserved. Start a fresh incident to practice in the guided workstation.
            </div>
          )}
          <div className="lab-actions">
            <button className="primary-button" type="button" onClick={startIncident} disabled={working}>
              <Play size={16} /> {working ? 'Starting incident…' : alreadyCompleted ? 'Replay Guided Incident' : 'Start Incident'}
            </button>
            <Link className="secondary-button" to="/lab">Advanced Console</Link>
          </div>
        </article>
        {error && <WorkstationError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="incident-mission-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>

      {error && <WorkstationError message={error} />}

      <div data-testid="incident-workspace" data-scenario-key={mission.scenarioKey}>
        <LabWorkstation
          caseLabel={'Mission ' + mission.missionNumber + ' · Guided troubleshooting'}
          title={mission.title.replace(/^Mission \d+ - /, '')}
          subtitle={mission.symptom}
          statusLabel={verified ? 'Recovery verified' : 'Processing stopped'}
          console={
            <ConsoleView
              mission={mission}
              run={incidentRun}
              failureDrill={failureDrill}
              observed={observed}
              payloadPreview={payloadPreview}
              selectedEvidence={selectedEvidence}
              selectedEvidenceId={selectedEvidenceId}
              detailMode={detailMode}
              inspectedEvidenceIds={inspectedEvidenceIds}
              onSelectEvidence={(id) => {
                setSelectedEvidenceId(id);
                setDetailMode('processing');
              }}
              onDetailMode={setDetailMode}
              onInspectSource={(id) => setInspectedEvidenceIds((current) => current.includes(id) ? current : [...current, id])}
            />
          }
          code={
            <CodeView
              files={files}
              activeFile={activeFile}
              activeFileId={activeFileId}
              mission={mission}
              onSelectFile={setActiveFileId}
            />
          }
          answer={
            <AnswerView
              mission={mission}
              lastHealthyId={lastHealthyId}
              diagnosisId={diagnosisId}
              planId={planId}
              requiredEvidenceInspected={requiredEvidenceInspected}
              recoveryRun={recoveryRun}
              recovery={recovery}
              verified={verified}
              statusUpdate={statusUpdate}
              working={working}
              completed={completed}
              onLastHealthy={setLastHealthyId}
              onDiagnosis={setDiagnosisId}
              onPlan={setPlanId}
              onRecover={applyFixAndRunAgain}
              onStatusUpdate={setStatusUpdate}
              onComplete={finishMission}
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
  failureDrill,
  observed,
  payloadPreview,
  selectedEvidence,
  selectedEvidenceId,
  detailMode,
  inspectedEvidenceIds,
  onSelectEvidence,
  onDetailMode,
  onInspectSource,
}: {
  mission: IncidentMissionDefinition;
  run: LabRun;
  failureDrill: Record<string, unknown> | null;
  observed: Record<string, unknown> | null;
  payloadPreview: unknown;
  selectedEvidence: IncidentEvidencePoint | undefined;
  selectedEvidenceId: string;
  detailMode: DetailMode;
  inspectedEvidenceIds: string[];
  onSelectEvidence: (id: string) => void;
  onDetailMode: (mode: DetailMode) => void;
  onInspectSource: (id: string) => void;
}) {
  const failed = mission.evidencePoints.find((point) => point.status === 'FAILED');
  return (
    <div className="workstation-console guided-workstation-console" data-testid="workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>FreightBridge integration log</span><strong>{run.businessIdentifier}</strong></div>
          <small>Read top to bottom. Later steps are not reached after the first failure.</small>
        </div>
        <div className="workstation-log-list">
          {mission.evidencePoints.map((point, index) => (
            <article
              key={point.id}
              className={'guided-log-record ' + point.status.toLowerCase().replace('_', '-')}
            >
              <button
                className={'workstation-log-row ' + point.status.toLowerCase().replace('_', '-') + (point.id === selectedEvidenceId ? ' selected' : '')}
                type="button"
                onClick={() => onSelectEvidence(point.id)}
                data-testid={'workstation-log-' + point.id}
              >
                <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
                <span className="workstation-log-icon">{statusIcon(point.status)}</span>
                <span className="workstation-log-copy">
                  <h3>{point.checkpoint}</h3>
                  <small>{point.source}</small>
                </span>
                <span className="workstation-log-status">{statusLabel(point.status)}</span>
              </button>
            </article>
          ))}
        </div>
        <div className="workstation-stop-banner">
          <XCircle size={17} />
          <span>
            Processing stopped at <strong>{failed?.checkpoint ?? 'the first failed checkpoint'}</strong>.
            {' '}Later checkpoints were not reached.
          </span>
        </div>

        {mission.evidenceSources && (
          <div className="guided-evidence-sources">
            {(mission.requiredEvidenceSourceIds?.length ?? 0) > 0
              && !(mission.requiredEvidenceSourceIds ?? []).every((id) => inspectedEvidenceIds.includes(id))
              && (
                <div className="workstation-answer-hint" data-testid="diagnosis-gate">
                  <AlertTriangle size={18} />
                  <p>Inspect the required evidence in Console before choosing the root cause.</p>
                </div>
              )}
            <div className="workstation-pane-heading">
              <div><span>Guided evidence</span><strong>Open the sources the mission asks you to compare</strong></div>
            </div>
            {mission.evidenceSources.map((source) => (
              <EvidenceSource
                key={source.id}
                source={source}
                run={run}
                failureDrill={failureDrill}
                inspected={inspectedEvidenceIds.includes(source.id)}
                onInspect={() => onInspectSource(source.id)}
              />
            ))}
          </div>
        )}

        {(mission.scenarioKey === 'APEX_INVALID_CONTRACT' || mission.scenarioKey === 'X12_214_UNSUPPORTED_STATUS') && (
          <FailureBoundaryClassifier mission={mission} observed={observed} />
        )}

        {(mission.scenarioKey === 'APEX_INVALID_CONTRACT' || mission.scenarioKey === 'X12_214_UNSUPPORTED_STATUS') && (
          <ContextualToolbox mission={mission} run={run} observed={observed} />
        )}

        <section className="guided-console-support">
          <div className="guided-answer-hints">
            {mission.hints.map((hint) => (
              <details key={hint.id}>
                <summary>{hint.label}</summary>
                <p>{hint.body}</p>
              </details>
            ))}
          </div>
          <AnalystNotes storageKey={'freightbridge.trainingNotes.' + mission.id} />
        </section>
      </section>

      <aside className="workstation-inspector">
        <div className="workstation-pane-heading">
          <div><span>Selected checkpoint</span><strong>{selectedEvidence?.checkpoint ?? 'Choose a log row'}</strong></div>
        </div>
        {selectedEvidence && (
          <>
            <dl className="workstation-inspector-grid">
              <div><dt>Status</dt><dd>{statusLabel(selectedEvidence.status)}</dd></div>
              <div><dt>Source</dt><dd>{selectedEvidence.source}</dd></div>
              <div><dt>Error code</dt><dd>{selectedEvidence.status === 'FAILED' ? String(observed?.errorCode ?? 'See failure evidence') : '—'}</dd></div>
              <div><dt>Stage</dt><dd>{selectedEvidence.status === 'FAILED' ? String(observed?.stage ?? 'See failure evidence') : '—'}</dd></div>
            </dl>
            <div className="workstation-detail-toggle" role="group" aria-label="Selected checkpoint evidence">
              <button className={detailMode === 'processing' ? 'active' : ''} type="button" onClick={() => onDetailMode('processing')}>
                View Processing Details
              </button>
              <button className={detailMode === 'raw' ? 'active' : ''} type="button" onClick={() => onDetailMode('raw')}>
                View Raw Message
              </button>
            </div>
            {detailMode === 'processing' ? (
              <div className="workstation-processing-detail" data-testid="workstation-processing-detail">
                <p>{selectedEvidence.observed}</p>
                <small>{selectedEvidence.meaning}</small>
                {selectedEvidence.status === 'FAILED' && (
                  <dl>
                    <div><dt>Error code</dt><dd>{String(observed?.errorCode ?? 'Unknown')}</dd></div>
                    <div><dt>Stage</dt><dd>{String(observed?.stage ?? 'Unknown')}</dd></div>
                    <div><dt>Category</dt><dd>{String(observed?.category ?? 'Unknown')}</dd></div>
                  </dl>
                )}
              </div>
            ) : (
              <div className="workstation-raw" data-testid="workstation-raw-message">
                <div><FileJson2 size={16} /><span>FreightBridge-visible evidence</span></div>
                <pre>{rawText(payloadPreview)}</pre>
                <small>Only evidence available to FreightBridge is shown; external partner internal logs are not inferred.</small>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function EvidenceSource({
  source,
  run,
  failureDrill,
  inspected,
  onInspect,
}: {
  source: IncidentEvidenceSource;
  run: LabRun;
  failureDrill: Record<string, unknown> | null;
  inspected: boolean;
  onInspect: () => void;
}) {
  return (
    <article className={'guided-evidence-source ' + (inspected ? 'inspected' : '')} data-testid={'evidence-source-' + source.id}>
      <button className="secondary-button" type="button" onClick={onInspect}>
        {inspected ? 'Inspected' : source.inspectedLabel}
      </button>
      <div>
        <span>{source.source}</span>
        <strong>{source.title}</strong>
        <p>{source.summary}</p>
      </div>
      {inspected && (
        <div className="guided-evidence-detail">
          {source.details.map((detail) => <p key={detail}>{detail}</p>)}
          {source.rawFrom && <pre>{renderRawEvidence(source.rawFrom, run, failureDrill)}</pre>}
        </div>
      )}
    </article>
  );
}

function CodeView({
  files,
  activeFile,
  activeFileId,
  mission,
  onSelectFile,
}: {
  files: CodeFile[];
  activeFile: CodeFile | undefined;
  activeFileId: string;
  mission: IncidentMissionDefinition;
  onSelectFile: (id: string) => void;
}) {
  if (!activeFile) return null;
  return (
    <div className="workstation-code" data-testid="workstation-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading"><div><span>Workspace</span><strong>Relevant files only</strong></div></div>
        <div className="workstation-file-list">
          {files.map((file) => (
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
        <strong>What should you notice?</strong>
        <p>{activeFile.note}</p>
        <details className="guided-hints">
          <summary>Need a hint?</summary>
          {mission.hints.map((hint) => (
            <details key={hint.id}>
              <summary>{hint.label}</summary>
              <p>{hint.body}</p>
            </details>
          ))}
        </details>
      </aside>
    </div>
  );
}

function AnswerView({
  mission,
  lastHealthyId,
  diagnosisId,
  planId,
  requiredEvidenceInspected,
  recoveryRun,
  recovery,
  verified,
  statusUpdate,
  working,
  completed,
  onLastHealthy,
  onDiagnosis,
  onPlan,
  onRecover,
  onStatusUpdate,
  onComplete,
}: {
  mission: IncidentMissionDefinition;
  lastHealthyId: string | null;
  diagnosisId: string | null;
  planId: string | null;
  requiredEvidenceInspected: boolean;
  recoveryRun: LabRun | null;
  recovery: Record<string, unknown> | null;
  verified: boolean;
  statusUpdate: string;
  working: boolean;
  completed: boolean;
  onLastHealthy: (id: string) => void;
  onDiagnosis: (id: string) => void;
  onPlan: (id: string) => void;
  onRecover: () => void;
  onStatusUpdate: (value: string) => void;
  onComplete: () => void;
}) {
  const lastHealthyCorrect = lastHealthyId === mission.correctLastHealthyId;
  const diagnosisCorrect = diagnosisId === mission.correctDiagnosisId;
  const planCorrect = planId === mission.correctPlanId;

  return (
    <div className="workstation-answer guided-workstation-answer" data-testid="workstation-answer">
      <div className="workstation-answer-intro">
        <span>Guided diagnosis</span>
        <h2>Use the evidence, then explain where the flow stopped.</h2>
        <p>The choices are intentionally structured in these early incidents. Wrong answers point you back toward the relevant evidence.</p>
      </div>

      <ChoicePanel
        testId="last-healthy-panel"
        prompt="Where did FreightBridge evidence last look healthy?"
        options={mission.lastHealthyOptions}
        selected={lastHealthyId}
        correctId={mission.correctLastHealthyId}
        onSelect={onLastHealthy}
      />

      {!requiredEvidenceInspected && (
        <div className="workstation-answer-hint" data-testid="diagnosis-gate">
          <AlertTriangle size={18} />
          <p>Inspect the required evidence in Console before choosing the root cause.</p>
        </div>
      )}

      <ChoicePanel
        testId="diagnosis-panel"
        prompt="What is the most accurate FreightBridge diagnosis?"
        options={mission.diagnosisOptions}
        selected={diagnosisId}
        correctId={mission.correctDiagnosisId}
        disabled={!requiredEvidenceInspected}
        onSelect={onDiagnosis}
      />

      <ChoicePanel
        testId="plan-panel"
        prompt="What should you do next?"
        options={mission.planOptions}
        selected={planId}
        correctId={mission.correctPlanId}
        disabled={!diagnosisCorrect}
        onSelect={onPlan}
      />

      <div className="guided-answer-hints">
        {mission.hints.map((hint) => (
          <details key={hint.id}>
            <summary>{hint.label}</summary>
            <p>{hint.body}</p>
          </details>
        ))}
      </div>

      <button
        className="primary-button"
        type="button"
        onClick={onRecover}
        disabled={working || !lastHealthyCorrect || !diagnosisCorrect || !planCorrect || !requiredEvidenceInspected}
      >
        {working ? 'Running recovery…' : mission.remediationLabel}
      </button>

      {recoveryRun && (
        <VerificationPanel mission={mission} run={recoveryRun} recovery={recovery} verified={verified} />
      )}

      {verified && (
        <label className="guided-status-update">
          <span>Write Mike a short incident update <small>(optional)</small></span>
          <textarea
            value={statusUpdate}
            onChange={(event) => onStatusUpdate(event.target.value)}
            placeholder={mission.statusPrompt}
          />
        </label>
      )}

      <button
        className="secondary-button"
        type="button"
        onClick={onComplete}
        disabled={!verified || completed}
      >
        <CheckCircle2 size={16} />
        {completed ? 'Debrief Complete' : 'Complete Debrief'}
      </button>
    </div>
  );
}

function ChoicePanel({
  testId,
  prompt,
  options,
  selected,
  correctId,
  disabled = false,
  onSelect,
}: {
  testId: string;
  prompt: string;
  options: IncidentOption[];
  selected: string | null;
  correctId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const selectedOption = options.find((option) => option.id === selected);
  const correct = selected === correctId;
  return (
    <fieldset className={'workstation-options ' + (disabled ? 'disabled-panel' : '')} data-testid={testId}>
      <legend>{prompt}</legend>
      <div role="radiogroup" aria-label={prompt}>
        {options.map((option) => (
          <label key={option.id} className={selected === option.id ? 'selected' : ''}>
            <input
              type="radio"
              name={testId}
              value={option.id}
              checked={selected === option.id}
              disabled={disabled}
              onChange={() => onSelect(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {selectedOption && (
        <div className={'workstation-option-feedback ' + (correct ? 'correct' : 'incorrect')}>
          {selectedOption.explanation}
        </div>
      )}
    </fieldset>
  );
}

function VerificationPanel({
  mission,
  run,
  recovery,
  verified,
}: {
  mission: IncidentMissionDefinition;
  run: LabRun;
  recovery: Record<string, unknown> | null;
  verified: boolean;
}) {
  const entries = verificationEntries(run, recovery);
  return (
    <article className={'guided-verification ' + (verified ? 'verified' : '')} data-testid="verification-panel">
      <div>
        <CheckCircle2 size={20} />
        <div>
          <strong>{verified ? 'Recovery SUCCEEDED' : 'Recovery evidence incomplete'}</strong>
          <p>{mission.verification}</p>
        </div>
      </div>
      {mission.missionNumber >= 5 ? (
        <p data-testid="recovery-correlation">Recovery stayed correlated to the same incident load.</p>
      ) : (
        <p data-testid="training-verification-note">
          Training verification only: FreightBridge simulates the corrected same-load retry here, so no second Apex load is created.
        </p>
      )}
      <dl>
        {entries.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </article>
  );
}

function FailureBoundaryClassifier({
  mission,
  observed,
}: {
  mission: IncidentMissionDefinition;
  observed: Record<string, unknown> | null;
}) {
  const contractIncident = mission.scenarioKey === 'APEX_INVALID_CONTRACT';
  return (
    <section className="guided-boundary-classifier" data-testid="contract-mapping-classifier">
      <h3>Contract validation vs. mapping failure</h3>
      <div>
        <article className={contractIncident ? 'active' : ''} data-testid="contract-failure-card">
          <strong>Inbound contract</strong>
          <p>JSON can parse successfully and still fail a required Apex business rule.</p>
        </article>
        <article className={!contractIncident ? 'active' : ''} data-testid="mapping-failure-card">
          <strong>Partner mapping</strong>
          <p>X12 can parse successfully and still contain a partner value FreightBridge cannot map.</p>
        </article>
      </div>
      <p data-testid="failure-boundary-verdict">
        {String(observed?.errorCode ?? 'Unknown')} · {String(observed?.stage ?? 'Unknown')}
      </p>
    </section>
  );
}

function ContextualToolbox({
  mission,
  run,
  observed,
}: {
  mission: IncidentMissionDefinition;
  run: LabRun;
  observed: Record<string, unknown> | null;
}) {
  const transactionId = stringOrNull(observed?.transactionId);
  const errorId = stringOrNull(observed?.errorId);
  const businessId = stringOrNull(observed?.businessIdentifier) ?? run.businessIdentifier;
  const mappingIncident = mission.scenarioKey === 'X12_214_UNSUPPORTED_STATUS';
  return (
    <section className="guided-context-tools" data-testid="incident-analyst-toolbox">
      <h3>Contextual analyst tools</h3>
      <div>
        <Link to={toolHref('trace', { businessId })}>
          <Network size={15} /> Business Trace
        </Link>
        {transactionId && (
          <>
            <Link to={toolHref('payload', { transactionId })}>
              <FileJson2 size={15} /> Payload Viewer
            </Link>
            <Link to={toolHref('logs', { transactionId })}>
              <ListTree size={15} /> Processing Log
            </Link>
          </>
        )}
        {errorId && (
          <Link to={toolHref('errors', { errorId })}>
            <AlertTriangle size={15} /> Error Detail
          </Link>
        )}
        {mappingIncident && (
          <Link to="/learn/tools/mappings">
            <SlidersHorizontal size={15} /> Mapping Viewer
          </Link>
        )}
      </div>
    </section>
  );
}

function guidedFiles(mission: IncidentMissionDefinition): CodeFile[] {
  return FILES_BY_SCENARIO[mission.scenarioKey] ?? [
    {
      id: 'reference',
      path: 'Reference/integration_flow.md',
      language: 'markdown',
      content: COMMON_PIPELINE,
      note: 'Use the normal processing order to locate the first failed checkpoint.',
    },
  ];
}

function recoveryVerified(
  mission: IncidentMissionDefinition,
  incidentRun: LabRun | null,
  recoveryRun: LabRun | null,
  recovery: Record<string, unknown> | null,
): boolean {
  if (!incidentRun || !recoveryRun) return false;
  if (mission.missionNumber < 5) {
    return recoveryRun.status === 'SUCCEEDED' && recoveryRun.businessIdentifier === incidentRun.businessIdentifier;
  }
  return (
    recoveryRun.businessIdentifier === incidentRun.businessIdentifier
    && recovery?.status === 'SUCCEEDED'
    && recovery?.sameBusinessIdentifier === true
  );
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
      shipmentStatus: 'DELIVERED',
      recovery: {
        status: 'SUCCEEDED',
        recoveryKind: 'TRAINING_VERIFICATION',
        sameBusinessIdentifier: true,
        parseStatus: 'SUCCEEDED',
        mappingStatus: 'SUCCEEDED',
        normalizedShipmentStatus: 'DELIVERED',
        apexFacingEvidence: true,
      },
    },
    updatedAt: now,
    completedAt: now,
    steps: [],
  };
}

function verificationEntries(run: LabRun, recovery: Record<string, unknown> | null): Array<[string, string]> {
  if (!recovery) {
    return [
      ['Status', run.status],
      ['Business Identifier', run.businessIdentifier],
      ['Shipment Status', String(run.resultSummary.shipmentStatus ?? 'SUCCEEDED')],
    ];
  }
  const labels: Record<string, string> = {
    status: 'Status',
    recoveryKind: 'Recovery Kind',
    sameBusinessIdentifier: 'Same Business Identifier',
    idempotentReplay: 'Idempotent Replay',
    originalShipmentReused: 'Original Shipment Reused',
    duplicate204Created: 'Duplicate 204 Created',
    controlCorrelation: 'Control Correlation',
    correctedSt02: 'Corrected ST02',
    correctedSe02: 'Corrected SE02',
    correctedAt7: 'Corrected AT7-01',
    parseStatus: 'Parsing',
    mappingStatus: 'Mapping',
    normalizedShipmentStatus: 'Shipment Status',
    apexFacingEvidence: 'Apex-Facing Evidence',
  };
  return Object.entries(recovery)
    .filter(([key]) => labels[key])
    .map(([key, value]) => [labels[key], displayValue(value)]);
}

function displayValue(value: unknown): string {
  if (value === true) return 'PRESENT';
  if (value === false) return 'NO';
  return String(value);
}

function EvidenceIcon({ status }: { status: string }) {
  if (status === 'SUCCEEDED') return <CheckCircle2 size={15} />;
  if (status === 'FAILED') return <XCircle size={15} />;
  return <Circle size={15} />;
}

function statusIcon(status: string) {
  return <EvidenceIcon status={status} />;
}

function statusLabel(status: string): string {
  return status === 'NOT_REACHED' ? 'NOT REACHED' : status;
}

function renderRawEvidence(
  source: 'failureDrill' | 'payloadPreview' | 'x12Fault' | 'observedFailure' | 'steps' | 'resultSummary',
  run: LabRun,
  failureDrill: Record<string, unknown> | null,
): string {
  const stepResponse = run.steps.find((step) => Object.keys(step.responseSummary ?? {}).length > 0)?.responseSummary;
  const value = (() => {
    switch (source) {
      case 'failureDrill':
        return failureDrill;
      case 'payloadPreview':
        return failureDrill?.payloadPreview ?? stepResponse?.payloadPreview;
      case 'x12Fault':
        return stepResponse?.x12Fault ?? failureDrill?.payloadPreview;
      case 'observedFailure':
        return failureDrill?.observed ?? stepResponse?.observedFailure;
      case 'steps':
        return run.steps.map((step) => ({
          stepKey: step.stepKey,
          status: step.status,
          relatedTransactionIds: step.relatedTransactionIds,
          requestSummary: step.requestSummary,
          responseSummary: step.responseSummary,
        }));
      case 'resultSummary':
        return run.resultSummary;
      default:
        return null;
    }
  })();
  return rawText(value);
}

function rawText(value: unknown): string {
  if (value === null || value === undefined) return 'Evidence pending.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function toolHref(tool: string, values: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => params.set(key, value));
  return '/learn/tools/' + tool + '?' + params.toString();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function generateIncidentLoadId(missionNumber: number): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return ('INC' + missionNumber + suffix).slice(0, 30);
}

function WorkstationError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div>
        <h2>Incident lab hit an unexpected system failure.</h2>
        <p>{message}</p>
      </div>
    </article>
  );
}

import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileJson2, ListTree, Network, Play, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, recoverLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  AnalystNotes,
  CommunicationMessage,
  HintPanel,
  MissionBriefing,
  MissionObjective,
  MissionPhaseProgress,
  MissionProgress,
  ReplayButton,
} from '../components/training/TrainingComponents';
import {
  findIncidentMissionBySlug,
  missionPhases,
  PRODUCTION_INCIDENT_MISSION_ID,
  trainingMissions,
} from '../training/missions';
import { isReplaySequencePracticeComplete } from '../training/advancedPractice';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { IncidentMissionDefinition, IncidentOption, IncidentStatus, MissionPhase } from '../training/types';

type RecoveryState = 'IDLE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export function IncidentMissionPage() {
  const { missionSlug } = useParams();
  const mission = findIncidentMissionBySlug(missionSlug);

  if (!mission) {
    return <Navigate to="/learn/desk" replace />;
  }

  const progress = loadTrainingProgress();
  const roadmapMission = trainingMissions.find((candidate) => candidate.id === mission.id);
  const roadmapPrerequisiteSatisfied =
    !roadmapMission?.unlocksAfter ||
    hasCompletedMission(progress, roadmapMission.unlocksAfter) ||
    hasCompletedMission(progress, mission.id);
  const finalShiftPrerequisiteSatisfied =
    mission.id !== PRODUCTION_INCIDENT_MISSION_ID ||
    isReplaySequencePracticeComplete() ||
    hasCompletedMission(progress, mission.id);

  if (!roadmapPrerequisiteSatisfied || !finalShiftPrerequisiteSatisfied) {
    return <Navigate to="/learn/desk" replace />;
  }

  return <IncidentMission mission={mission} />;
}

function IncidentMission({ mission }: { mission: IncidentMissionDefinition }) {
  const { token, handleApiError } = useOperationsSession();
  const [phase, setPhase] = useState<MissionPhase>('BRIEFING');
  const [incidentRun, setIncidentRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [lastHealthyId, setLastHealthyId] = useState<string | null>(null);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [inspectedEvidenceIds, setInspectedEvidenceIds] = useState<string[]>([]);
  const [statusUpdate, setStatusUpdate] = useState('');
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('IDLE');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const progress = loadTrainingProgress();
  const alreadyCompleted = hasCompletedMission(progress, mission.id);
  const failureDrill = useMemo(() => readRecord(incidentRun?.resultSummary.failureDrill), [incidentRun]);
  const observed = readRecord(failureDrill?.observed);
  const expected = readRecord(failureDrill?.expected);
  const isContractOrMappingMission = mission.scenarioKey === 'APEX_INVALID_CONTRACT' || mission.scenarioKey === 'X12_214_UNSUPPORTED_STATUS';
  const isProfileVersionMission = mission.scenarioKey === 'X12_214_WRONG_VERSION';
  const isTransportBoundaryMission = mission.scenarioKey === 'SFTP_HOST_KEY_MISMATCH';
  const isFinalShift = mission.id === PRODUCTION_INCIDENT_MISSION_ID;
  const recoveryEvidence = useMemo(
    () => readRecord(recoveryRun?.resultSummary.recovery),
    [recoveryRun],
  );
  const requiredEvidenceIds = mission.requiredEvidenceSourceIds ?? [];
  const requiredEvidenceInspected = requiredEvidenceIds.every((id) => inspectedEvidenceIds.includes(id));
  const canDiagnose = requiredEvidenceInspected && lastHealthyId === mission.correctLastHealthyId && diagnosisId === mission.correctDiagnosisId;
  const canPlan = planId === mission.correctPlanId;
  const recoveryCorrelated = isTransportBoundaryMission
    ? Boolean(
        recoveryRun &&
        recoveryEvidence?.status === 'SUCCEEDED' &&
        recoveryEvidence?.connectionVerified === true &&
        recoveryEvidence?.transactionCreated === false &&
        recoveryEvidence?.messageReplayAttempted === false
      )
    : Boolean(
        incidentRun &&
        recoveryRun &&
        recoveryRun.businessIdentifier === incidentRun.businessIdentifier &&
        (
          mission.missionNumber < 5 ||
          recoveryEvidence?.sameBusinessIdentifier === true
        )
      );
  const selectedLastHealthy = mission.lastHealthyOptions.find((option) => option.id === lastHealthyId);
  const selectedDiagnosis = mission.diagnosisOptions.find((option) => option.id === diagnosisId);
  const selectedPlan = mission.planOptions.find((option) => option.id === planId);
  const canReport =
    canDiagnose &&
    canPlan &&
    recoveryState === 'SUCCEEDED' &&
    recoveryCorrelated &&
    statusUpdate.trim().length >= 40;
  const objectives = [
    Boolean(incidentRun),
    phaseOrder(phase) >= phaseOrder('INVESTIGATE'),
    lastHealthyId === mission.correctLastHealthyId,
    diagnosisId === mission.correctDiagnosisId,
    planId === mission.correctPlanId,
    recoveryState === 'SUCCEEDED',
    statusUpdate.trim().length >= 40,
    completed || alreadyCompleted,
  ].filter(Boolean).length;

  async function startIncident() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setCompleted(false);
    setRecoveryRun(null);
    setRecoveryState('IDLE');
    setStatusUpdate('');
    setLastHealthyId(null);
    setDiagnosisId(null);
    setPlanId(null);
    setInspectedEvidenceIds([]);
    try {
      let nextIncidentRun = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: generateIncidentLoadId(mission.missionNumber),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Training Incident Freight',
      });
      let guard = 0;
      while (nextIncidentRun.status !== 'SUCCEEDED' && nextIncidentRun.status !== 'FAILED' && guard < 10) {
        const executed = await runNextLabStep(token, nextIncidentRun.id);
        nextIncidentRun = executed.run;
        guard += 1;
      }
      if (nextIncidentRun.status !== 'SUCCEEDED') {
        throw new Error('Controlled incident drill did not reach its expected observed-failure result.');
      }
      setIncidentRun(nextIncidentRun);
      setPhase('INVESTIGATE');
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Incident drill could not be started.');
    } finally {
      setWorking(false);
    }
  }

  async function runRecovery() {
    if (!token || !incidentRun) return;
    setWorking(true);
    setError(null);
    setRecoveryState('RUNNING');
    try {
      if (mission.missionNumber >= 5) {
        const recoveredRun = await recoverLabRun(token, incidentRun.id);
        const proof = readRecord(recoveredRun.resultSummary.recovery);
        const verified = mission.scenarioKey === 'SFTP_HOST_KEY_MISMATCH'
          ? proof?.connectionVerified === true
            && proof?.transactionCreated === false
            && proof?.messageReplayAttempted === false
          : recoveredRun.businessIdentifier === incidentRun.businessIdentifier
            && proof?.sameBusinessIdentifier === true;
        const succeeded = proof?.status === 'SUCCEEDED' && verified;
        setRecoveryRun(recoveredRun);
        setRecoveryState(succeeded ? 'SUCCEEDED' : 'FAILED');
        if (succeeded) {
          setPhase('VERIFY');
        } else {
          setError(
            mission.scenarioKey === 'SFTP_HOST_KEY_MISMATCH'
              ? 'Server-backed recovery did not produce complete SFTP connectivity verification evidence.'
              : 'Server-backed recovery did not produce complete same-load verification evidence.',
          );
        }
        return;
      }

      let nextRun = await createLabRun(token, {
        scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
        loadId: incidentRun.businessIdentifier,
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Recovered Training Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 30) {
        const result = await runNextLabStep(token, nextRun.id);
        nextRun = result.run;
        guard += 1;
      }
      const correlated = nextRun.businessIdentifier === incidentRun.businessIdentifier;
      setRecoveryRun(nextRun);
      setRecoveryState(nextRun.status === 'SUCCEEDED' && correlated ? 'SUCCEEDED' : 'FAILED');
      if (nextRun.status === 'SUCCEEDED' && correlated) {
        setPhase('VERIFY');
      } else if (!correlated) {
        setError('The recovery run did not preserve the original incident load identifier.');
      } else {
        setError('The recovery retry did not complete successfully.');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setRecoveryState('FAILED');
      setError(nextError instanceof ApiError ? nextError.message : 'Recovery retry hit an unexpected failure.');
    } finally {
      setWorking(false);
    }
  }

  function markEvidenceInspected(id: string) {
    setInspectedEvidenceIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function finishMission() {
    if (!canReport) return;
    completeMission(mission.id);
    setCompleted(true);
    setPhase('DEBRIEF');
  }

  return (
    <section className="training-stack" data-testid="incident-mission-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} />
        Training Desk
      </Link>

      <MissionBriefing>
        <p className="eyebrow">Mission {mission.missionNumber} - {isFinalShift ? 'Final Shift' : mission.missionNumber >= 8 ? 'Advanced' : mission.missionNumber >= 5 ? 'Intermediate' : 'Beginner'} Incident</p>
        <h1>{mission.title.replace(/^Mission \d+ - /, '')}</h1>
        <p>{mission.symptom}</p>
        <MissionPhaseProgress phases={missionPhases} current={phase} />
      </MissionBriefing>

      <div data-testid="incident-phase" className="phase-banner">
        Current phase: <strong>{phase}</strong>
      </div>

      <CommunicationMessage message={mission.briefing} />
      <CommunicationMessage message={mission.partnerMessage} />

      {alreadyCompleted && !incidentRun && (
        <article className="panel replay-panel" data-testid="completed-incident-review">
          <div className="panel-header">
            <h2>{mission.title} Complete</h2>
            <CheckCircle2 size={22} />
          </div>
          <p className="muted-text">Your progress is recognized. Replay this incident with a fresh real failure drill.</p>
          <ReplayButton onReplay={startIncident} disabled={working} />
        </article>
      )}

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h2>Mission Objectives</h2>
            <MissionProgress completed={objectives} total={8} />
          </div>
          <div className="mission-objectives">
            <MissionObjective done={Boolean(incidentRun)}>Run the controlled FreightBridge failure drill.</MissionObjective>
            <MissionObjective done={requiredEvidenceIds.length === 0 ? phaseOrder(phase) >= phaseOrder('INVESTIGATE') : requiredEvidenceInspected}>
              Inspect required FreightBridge evidence.
            </MissionObjective>
            <MissionObjective done={lastHealthyId === mission.correctLastHealthyId}>Choose the last healthy checkpoint.</MissionObjective>
            <MissionObjective done={diagnosisId === mission.correctDiagnosisId}>Diagnose where the flow stopped.</MissionObjective>
            <MissionObjective done={planId === mission.correctPlanId}>Choose a safe remediation plan.</MissionObjective>
            <MissionObjective done={recoveryState === 'SUCCEEDED'}>{mission.missionNumber >= 5 ? 'Verify server-backed incident recovery.' : 'Verify recovery with a healthy Lab retry.'}</MissionObjective>
            <MissionObjective done={statusUpdate.trim().length >= 40}>Send Mike a status update.</MissionObjective>
            <MissionObjective done={completed || alreadyCompleted}>Complete the debrief.</MissionObjective>
          </div>
          <div className="lab-actions">
            {!incidentRun ? (
              <button className="primary-button" type="button" onClick={startIncident} disabled={working}>
                <Play size={16} />
                Start Incident
              </button>
            ) : (
              <ReplayButton onReplay={startIncident} disabled={working} />
            )}
            <Link className="secondary-button" to="/lab">
              <ExternalLink size={16} />
              Advanced Console
            </Link>
          </div>
        </article>

        <article className="panel" data-testid="healthy-baseline-comparison">
          <div className="panel-header">
            <h2>{isFinalShift ? 'Independent Investigation' : 'Healthy Baseline Comparison'}</h2>
          </div>
          {isFinalShift ? (
            <>
              <p className="muted-text">No checkpoint map or failure classifier is provided on the final shift.</p>
              <p>Use the same FreightBridge evidence model you learned earlier: establish what arrived, determine the last successful processing stage, correlate the business identifiers, then prove recovery.</p>
            </>
          ) : (
            <>
              <p className="muted-text">
                In Mission 1, a healthy flow reached authentication, parsing, validation, canonical shipment, 204, SFTP, 997, 990, 214, and Apex-facing update evidence.
              </p>
              <p>This incident asks you to identify the first point where the real failure drill diverged from that baseline.</p>
            </>
          )}
        </article>
      </section>

      {error && (
        <article className="panel training-alert" role="alert">
          <AlertTriangle size={20} />
          <div>
            <h2>Incident mission hit an unexpected system failure.</h2>
            <p>{error}</p>
          </div>
        </article>
      )}

      {incidentRun && (
        <section
          className="training-stack"
          data-testid="incident-workspace"
          data-scenario-key={mission.scenarioKey}
        >
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">FreightBridge Failure Drill</p>
                <h2>Incident Evidence</h2>
              </div>
              <span className="badge badge-danger">Incident observed</span>
            </div>
            <dl className="definition-grid">
              <div><dt>Run Status</dt><dd>{incidentRun.status}</dd></div>
              <div><dt>Incident Load</dt><dd data-testid="incident-load-id">{incidentRun.businessIdentifier}</dd></div>
              <div><dt>Processing Status</dt><dd>{String(observed?.processingStatus ?? 'FAILED')}</dd></div>
            </dl>
            <p className="muted-text">{mission.symptom}</p>
            <details className="evidence-panel" data-testid="technical-classification">
              <summary>Inspect technical classification</summary>
              <dl className="definition-grid">
                <div><dt>Error Code</dt><dd>{String(observed?.errorCode ?? expected?.errorCode ?? 'Unknown')}</dd></div>
                <div><dt>Observed Stage</dt><dd>{String(observed?.stage ?? expected?.stage ?? 'Unknown')}</dd></div>
                <div><dt>Observed Category</dt><dd>{String(observed?.category ?? expected?.category ?? 'Unknown')}</dd></div>
                <div><dt>Retryable</dt><dd>{String(observed?.retryable ?? expected?.retryable ?? false)}</dd></div>
              </dl>
              <p>{String(failureDrill?.guidance ?? 'Use the observed stage and surrounding evidence to classify the incident.')}</p>
            </details>
            <details className="evidence-panel">
              <summary>Inspect safe failure payload preview</summary>
              <pre className="lab-preview">{JSON.stringify(failureDrill?.payloadPreview ?? incidentRun.resultSummary, null, 2)}</pre>
            </details>
          </article>

          {isContractOrMappingMission && (
            <>
              <FailureBoundaryClassifier mission={mission} observed={observed} />
              <IncidentAnalystToolbox mission={mission} run={incidentRun} observed={observed} />
            </>
          )}
          {isProfileVersionMission && (
            <>
              <ProfileVersionCompatibilityPanel observed={observed} />
              <IncidentAnalystToolbox mission={mission} run={incidentRun} observed={observed} />
            </>
          )}
          {isTransportBoundaryMission && (
            <TransportBoundaryPanel observed={observed} />
          )}
          {isFinalShift && (
            <IncidentAnalystToolbox mission={mission} run={incidentRun} observed={observed} />
          )}

          {!isFinalShift && (
            <article className="panel">
              <div className="panel-header"><h2>Evidence Checkpoints</h2></div>
              <div className="incident-evidence-grid">
                {mission.evidencePoints.map((point) => (
                  <article key={point.id} className={`incident-evidence ${point.status.toLowerCase().replace('_', '-')}`}>
                    <span className="incident-status">{labelForStatus(point.status)}</span>
                    <h3>{point.checkpoint}</h3>
                    <p className="eyebrow">{point.source}</p>
                    <p>{point.observed}</p>
                    <small>{point.meaning}</small>
                  </article>
                ))}
              </div>
            </article>
          )}

          <section className={isFinalShift ? 'workstation-grid final-shift-notes' : 'content-grid workstation-grid'}>
            {!isFinalShift && <HintPanel hints={mission.hints} />}
            <AnalystNotes storageKey={`freightbridge.trainingNotes.${mission.id}`} />
          </section>

          {mission.evidenceSources && (
            <article className="panel" data-testid="intermediate-evidence-workspace">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Investigation Workspace</p>
                  <h2>Evidence Sources</h2>
                </div>
                <span className="badge badge-info">
                  {inspectedEvidenceIds.length} / {requiredEvidenceIds.length || mission.evidenceSources.length} inspected
                </span>
              </div>
              <p className="muted-text">
                {isFinalShift
                  ? 'Inspect every required source and build the diagnosis from FreightBridge evidence. No final-shift hint path is provided.'
                  : 'Inspect at least two relevant FreightBridge evidence sources before making the final diagnosis.'}
              </p>
              <div className="intermediate-evidence-grid">
                {mission.evidenceSources.map((source) => {
                  const inspected = inspectedEvidenceIds.includes(source.id);
                  const required = requiredEvidenceIds.includes(source.id);
                  return (
                    <details
                      key={source.id}
                      className={`evidence-panel intermediate-source ${inspected ? 'inspected' : ''}`}
                      data-testid={`evidence-source-${source.id}`}
                      onToggle={(event) => {
                        if (event.currentTarget.open) markEvidenceInspected(source.id);
                      }}
                    >
                      <summary>
                        <span>{source.inspectedLabel}</span>
                        {required && <small>Required</small>}
                      </summary>
                      <div className="evidence-source-body">
                        <p className="eyebrow">{source.source}</p>
                        <h3>{source.title}</h3>
                        <p>{source.summary}</p>
                        <ul className="check-list">
                          {source.details.map((detail) => <li key={detail}>{detail}</li>)}
                        </ul>
                        {source.rawFrom && (
                          <pre className="lab-preview">{renderRawEvidence(source.rawFrom, incidentRun, failureDrill)}</pre>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
              {!requiredEvidenceInspected && requiredEvidenceIds.length > 0 && (
                <div className="knowledge-feedback incorrect" data-testid="diagnosis-gate">
                  <AlertTriangle size={18} />
                  <p>Inspect the required evidence sources before selecting a final diagnosis.</p>
                </div>
              )}
            </article>
          )}

          <ChoicePanel
            testId="last-healthy-checkpoint-selector"
            title="Last Healthy Checkpoint"
            prompt="Where did FreightBridge evidence last look healthy before the failure?"
            options={mission.lastHealthyOptions}
            selected={lastHealthyId}
            correctId={mission.correctLastHealthyId}
            onSelect={(id) => {
              setLastHealthyId(id);
              setPhase('DIAGNOSE');
            }}
          />

          <ChoicePanel
            testId="diagnosis-panel"
            title="Diagnosis"
            prompt="What is the most accurate FreightBridge diagnosis?"
            options={mission.diagnosisOptions}
            selected={diagnosisId}
            correctId={mission.correctDiagnosisId}
            disabled={lastHealthyId !== mission.correctLastHealthyId || !requiredEvidenceInspected}
            onSelect={(id) => {
              setDiagnosisId(id);
              if (id === mission.correctDiagnosisId && lastHealthyId === mission.correctLastHealthyId) {
                setPhase('PLAN');
              }
            }}
          />

          <ChoicePanel
            testId="plan-panel"
            title="Safe Plan"
            prompt="What should you do next?"
            options={mission.planOptions}
            selected={planId}
            correctId={mission.correctPlanId}
            disabled={!canDiagnose}
            onSelect={(id) => {
              setPlanId(id);
              if (id === mission.correctPlanId && canDiagnose) {
                setPhase('ACT');
              }
            }}
          />

          <article className="panel" data-testid="remediation-action">
            <div className="panel-header">
              <h2>Act</h2>
            </div>
            <p>
              {mission.remediationLabel}.{' '}
              {isTransportBoundaryMission
                ? 'FreightBridge will verify the real configured SFTP trust path and required directories without replaying business traffic.'
                : mission.missionNumber >= 5
                  ? 'FreightBridge will perform the mission-specific server-backed remediation on the same incident load and return concrete recovery evidence.'
                  : 'FreightBridge will retry the same incident load through the clean training path, then verify that the previously failing flow now progresses normally.'}
            </p>
            <div className="lab-actions">
              <button className="primary-button" type="button" onClick={runRecovery} disabled={!canPlan || working || recoveryState === 'SUCCEEDED'}>
                <RefreshCw size={16} />
                {mission.remediationLabel}
              </button>
              {incidentRun && (
                <Link className="secondary-button" to={`/lab/runs/${incidentRun.id}`}>
                  View Incident Run
                </Link>
              )}
            </div>
          </article>

          <article className="panel" data-testid="verification-panel">
            <div className="panel-header">
              <h2>Verify Recovery</h2>
              <span className={`badge ${recoveryState === 'SUCCEEDED' ? 'badge-success' : recoveryState === 'FAILED' ? 'badge-danger' : 'badge-neutral'}`}>
                {recoveryState}
              </span>
            </div>
            <p>{mission.verification}</p>
            {recoveryRun && (
              <>
                <dl className="definition-grid">
                {isTransportBoundaryMission ? (
                  <>
                    <div><dt>Recovery Target</dt><dd>Midwest SFTP trust and connectivity</dd></div>
                    <div><dt>Original Transaction</dt><dd>NONE - failure occurred before ingestion</dd></div>
                    <div><dt>Recovery Status</dt><dd>{String(recoveryEvidence?.status ?? recoveryRun.status)}</dd></div>
                    <div><dt>Connection Verified</dt><dd>{recoveryEvidence?.connectionVerified === true ? 'YES' : 'NO'}</dd></div>
                    <div><dt>Host-Key Pinning</dt><dd>{String(recoveryEvidence?.hostKeyPinning ?? 'Pending')}</dd></div>
                    <div><dt>Transaction Created</dt><dd>{recoveryEvidence?.transactionCreated === true ? 'YES' : 'NO'}</dd></div>
                    <div><dt>Message Replay Attempted</dt><dd>{recoveryEvidence?.messageReplayAttempted === true ? 'YES' : 'NO'}</dd></div>
                    <div><dt>Required Directories</dt><dd>{formatDirectoryReadiness(recoveryEvidence?.directories)}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Incident Load</dt><dd>{incidentRun.businessIdentifier}</dd></div>
                    <div><dt>Recovery Path</dt><dd>{mission.recoveryMode === 'INCIDENT_VERIFICATION' ? 'Protected incident verification' : 'Corrected healthy lifecycle'}</dd></div>
                    <div><dt>Recovery Load</dt><dd>{recoveryRun.businessIdentifier}</dd></div>
                    <div>
                      <dt>Correlation</dt>
                      <dd data-testid="recovery-correlation">
                        {recoveryCorrelated ? 'MATCHED - same incident load' : 'MISMATCH'}
                      </dd>
                    </div>
                    <div><dt>Recovery Status</dt><dd>{mission.missionNumber >= 5 ? String(recoveryEvidence?.status ?? recoveryRun.status) : recoveryRun.status}</dd></div>
                    <div><dt>Tender Status</dt><dd>{String(recoveryRun.resultSummary.tenderStatus ?? 'Pending')}</dd></div>
                    <div><dt>Shipment Status</dt><dd>{String(recoveryEvidence?.normalizedShipmentStatus ?? recoveryRun.resultSummary.shipmentStatus ?? 'Pending')}</dd></div>
                  </>
                )}
                {mission.missionNumber >= 5 && (
                  <>
                    <div><dt>Recovery Action</dt><dd>{String(recoveryEvidence?.recoveryKind ?? 'Unknown')}</dd></div>
                    {recoveryEvidence?.idempotentReplay !== undefined && (
                      <div><dt>Idempotent Replay</dt><dd>{recoveryEvidence.idempotentReplay === true ? 'YES' : 'NO'}</dd></div>
                    )}
                    {recoveryEvidence?.originalTransactionId && (
                      <div><dt>Original Transaction</dt><dd>{String(recoveryEvidence.originalTransactionId)}</dd></div>
                    )}
                    {recoveryEvidence?.replayTransactionId && (
                      <div><dt>Replay Transaction</dt><dd>{String(recoveryEvidence.replayTransactionId)}</dd></div>
                    )}
                    {recoveryEvidence?.duplicate204Created !== undefined && (
                      <div><dt>Duplicate 204 Created</dt><dd>{recoveryEvidence.duplicate204Created === true ? 'YES' : 'NO'}</dd></div>
                    )}
                    {recoveryEvidence?.correctedSt02 && (
                      <div><dt>Corrected ST02</dt><dd>{String(recoveryEvidence.correctedSt02)}</dd></div>
                    )}
                    {recoveryEvidence?.correctedSe02 && (
                      <div><dt>Corrected SE02</dt><dd>{String(recoveryEvidence.correctedSe02)}</dd></div>
                    )}
                    {recoveryEvidence?.controlCorrelation && (
                      <div><dt>Control Correlation</dt><dd>{String(recoveryEvidence.controlCorrelation)}</dd></div>
                    )}
                    {recoveryEvidence?.correctedAt7 && (
                      <div><dt>Corrected AT7-01</dt><dd>{String(recoveryEvidence.correctedAt7)}</dd></div>
                    )}
                    {recoveryEvidence?.correctedIsa12 && (
                      <div><dt>Corrected ISA12</dt><dd>{String(recoveryEvidence.correctedIsa12)}</dd></div>
                    )}
                    {recoveryEvidence?.correctedGs08 && (
                      <div><dt>Corrected GS08</dt><dd>{String(recoveryEvidence.correctedGs08)}</dd></div>
                    )}
                    {recoveryEvidence?.correctedShipmentReference && (
                      <div><dt>Corrected Shipment Reference</dt><dd>{String(recoveryEvidence.correctedShipmentReference)}</dd></div>
                    )}
                    {recoveryEvidence?.profileCompatibility && (
                      <div><dt>Profile Compatibility</dt><dd>{String(recoveryEvidence.profileCompatibility)}</dd></div>
                    )}
                    {recoveryEvidence?.parseStatus && (
                      <div><dt>Parsing</dt><dd>{String(recoveryEvidence.parseStatus)}</dd></div>
                    )}
                    {recoveryEvidence?.mappingStatus && (
                      <div><dt>Mapping</dt><dd>{String(recoveryEvidence.mappingStatus)}</dd></div>
                    )}
                    {recoveryEvidence?.apexFacingEvidence !== undefined && (
                      <div><dt>Apex-Facing Evidence</dt><dd>{recoveryEvidence.apexFacingEvidence === true ? 'PRESENT' : 'MISSING'}</dd></div>
                    )}
                  </>
                )}
              </dl>
              {mission.missionNumber >= 5 && typeof recoveryEvidence?.correctedX12 === 'string' && (
                <details className="technical-classification">
                  <summary>Inspect corrected recovery X12</summary>
                  <pre className="lab-preview">{recoveryEvidence.correctedX12}</pre>
                </details>
              )}
              </>
            )}
          </article>

          <article className="panel" data-testid="status-update">
            <div className="panel-header">
              <h2>Status Update to Mike</h2>
            </div>
            <label>
              {mission.statusPrompt}
              <textarea
                value={statusUpdate}
                onChange={(event) => {
                  setStatusUpdate(event.target.value);
                  if (recoveryState === 'SUCCEEDED') setPhase('REPORT');
                }}
                placeholder="Mike, FreightBridge observed..."
              />
            </label>
            <button className="primary-button" type="button" onClick={finishMission} disabled={!canReport}>
              Complete Debrief
            </button>
          </article>
        </section>
      )}

      {(completed || alreadyCompleted) && (
        <article className="panel mission-complete-panel visible" data-testid="incident-debrief">
          <div className="panel-header">
            <h2>Debrief</h2>
            <CheckCircle2 size={24} />
          </div>
          <h3>MISSION COMPLETE - {mission.shortTitle}</h3>
          <section className="incident-summary" data-testid="incident-summary">
            <h4>Structured Incident Summary</h4>
            <dl className="definition-grid">
              <div><dt>Impact</dt><dd>{mission.symptom}</dd></div>
              <div><dt>Last Healthy Checkpoint</dt><dd>{selectedLastHealthy?.label ?? 'Not recorded'}</dd></div>
              <div><dt>Root Cause</dt><dd>{selectedDiagnosis?.label ?? 'Not recorded'}</dd></div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {String(observed?.errorCode ?? expected?.errorCode ?? 'Unknown')} at{' '}
                  {String(observed?.stage ?? expected?.stage ?? 'Unknown')}
                </dd>
              </div>
              <div><dt>Action</dt><dd>{selectedPlan?.label ?? mission.remediationLabel}</dd></div>
              <div>
                <dt>Verification</dt>
                <dd>
                  {recoveryRun
                    ? isTransportBoundaryMission
                      ? `${String(recoveryEvidence?.status ?? recoveryRun.status)}; trusted SFTP connectivity verified without transaction replay`
                      : `${recoveryRun.status}; ${recoveryCorrelated ? 'same load correlated' : 'load correlation mismatch'}`
                    : 'Not recorded'}
                </dd>
              </div>
            </dl>
          </section>
          <ul className="check-list">
            {mission.debrief.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="lab-actions">
            <Link className="primary-button" to="/learn/desk">Return to Training Desk</Link>
            <button className="secondary-button" type="button" onClick={startIncident} disabled={working} data-testid={`replay-incident-${mission.id}`}>
              <RefreshCw size={16} />
              Replay Incident
            </button>
          </div>
        </article>
      )}
    </section>
  );
}




function TransportBoundaryPanel({
  observed,
}: {
  observed: Record<string, unknown> | null;
}) {
  return (
    <article className="panel transport-boundary-panel" data-testid="transport-boundary-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Milestone 37 · Pre-Transaction Transport Boundary</p>
          <h2>No integration transaction exists yet</h2>
        </div>
        <span className="badge badge-danger">{String(observed?.errorCode ?? 'SFTP_HOST_KEY_MISMATCH')}</span>
      </div>
      <p className="muted-text">
        The controlled probe reaches SSH host identity verification and stops there. FreightBridge never reaches authentication, directory operations, X12 parsing, or transaction persistence.
      </p>
      <div className="transport-boundary-flow">
        <span className="complete">Endpoint configured</span>
        <span className="failed">Host-key verification failed</span>
        <span>Authentication not reached</span>
        <span>File operation not reached</span>
        <span>Transaction not created</span>
      </div>
      <div className="analyst-question">
        <AlertTriangle size={17} />
        <div>
          <strong>Do not invent missing evidence</strong>
          <span>Transaction Search, Processing Log, and Error Detail are not the primary evidence sources when the failure occurs before an integration transaction is created.</span>
        </div>
      </div>
      <Link className="secondary-button compact-inline-action" to="/learn/tools/partners?partnerCode=MWCX">
        Open Midwest Partner Profile
      </Link>
    </article>
  );
}


function ProfileVersionCompatibilityPanel({
  observed,
}: {
  observed: Record<string, unknown> | null;
}) {
  return (
    <article className="panel profile-version-panel" data-testid="profile-version-compatibility">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Milestone 36 · X12/Profile Compatibility</p>
          <h2>Structurally valid does not mean profile-compatible</h2>
        </div>
        <span className="badge badge-danger">{String(observed?.errorCode ?? 'UNSUPPORTED_X12_VERSION')}</span>
      </div>
      <div className="profile-version-grid">
        <article>
          <span>Received from Midwest</span>
          <strong>ISA12 00501</strong>
          <strong>GS08 005010</strong>
          <small>The transaction can still be structurally parseable.</small>
        </article>
        <div className="profile-version-compare">≠</div>
        <article className="supported">
          <span>Active FreightBridge profile</span>
          <strong>ISA12 00401</strong>
          <strong>GS08 004010</strong>
          <small>This is the supported Midwest project contract.</small>
        </article>
      </div>
      <div className="analyst-question">
        <SlidersHorizontal size={17} />
        <div>
          <strong>Analyst distinction</strong>
          <span>Mission 6 failed X12 control validation. Mission 7 passed structure but failed AT7 semantic mapping. Mission 8 passes structure and uses a valid status, but fails the partner version/profile gate.</span>
        </div>
      </div>
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
  const observedStage = String(observed?.stage ?? 'Unknown');
  const observedCode = String(observed?.errorCode ?? 'Unknown');

  return (
    <article className="panel failure-boundary-classifier" data-testid="contract-mapping-classifier">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Milestone 35 · Failure Classifier</p>
          <h2>Contract validation vs. mapping failure</h2>
        </div>
        <span className="badge badge-danger">{observedStage}</span>
      </div>
      <p className="muted-text">
        Both incidents can contain syntactically readable data. The analyst distinguishes them by proving how far FreightBridge progressed before the first failed checkpoint.
      </p>

      <div className="failure-boundary-grid">
        <article className={contractIncident ? 'active' : ''} data-testid="contract-failure-card">
          <span className="failure-boundary-kind">Inbound contract</span>
          <h3>Readable JSON, invalid Apex load</h3>
          <ol>
            <li className="complete">Request received</li>
            <li className="complete">Authentication succeeded</li>
            <li className="complete">JSON parsing succeeded</li>
            <li className="failed">Apex contract validation failed</li>
            <li className="not-reached">Canonical shipment / mapping not reached</li>
          </ol>
          <p><strong>Typical evidence:</strong> required field/type rule, validation-stage error, no downstream mapping attempt.</p>
        </article>

        <article className={!contractIncident ? 'active' : ''} data-testid="mapping-failure-card">
          <span className="failure-boundary-kind">Partner mapping</span>
          <h3>Readable X12, unsupported partner meaning</h3>
          <ol>
            <li className="complete">214 file received</li>
            <li className="complete">X12 parsing succeeded</li>
            <li className="failed">Midwest status mapping failed</li>
            <li className="not-reached">Canonical shipment event not created</li>
            <li className="not-reached">Apex-facing status update not reached</li>
          </ol>
          <p><strong>Typical evidence:</strong> valid transaction structure, unsupported AT7-01 value, mapping-stage error.</p>
        </article>
      </div>

      <div className="failure-boundary-verdict" data-testid="failure-boundary-verdict">
        <strong>This incident:</strong>
        <span>
          {contractIncident
            ? 'FreightBridge parsed the Apex JSON, then rejected it at the inbound business contract boundary.'
            : 'FreightBridge parsed the Midwest 214, then rejected the unsupported status at the partner mapping boundary.'}
        </span>
        <small>{observedCode} · {observedStage}</small>
      </div>
    </article>
  );
}

function IncidentAnalystToolbox({
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
  const finalShift = mission.scenarioKey === 'X12_214_UNKNOWN_SHIPMENT';
  const businessId = finalShift ? run.businessIdentifier : stringOrNull(observed?.businessIdentifier) ?? run.businessIdentifier;
  const mappingIncident = mission.scenarioKey === 'X12_214_UNSUPPORTED_STATUS' || mission.scenarioKey === 'X12_214_WRONG_VERSION';

  return (
    <article className="panel incident-toolbox" data-testid="incident-analyst-toolbox">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Use Your Analyst Toolset</p>
          <h2>Prove the stop point from FreightBridge evidence</h2>
        </div>
      </div>
      <p className="muted-text">
        These links open the compact read-only tools inside the Ops Desk. The incident drill supplies the real FreightBridge transaction and error identifiers when they exist.
      </p>
      <div className="incident-tool-links">
        {businessId && (
          <Link to={toolHref('trace', { businessId })}>
            <Network size={16} />
            <span><strong>Business Trace</strong><small>See how far this load progressed</small></span>
          </Link>
        )}
        {transactionId && (
          <>
            <Link to={toolHref('payload', { transactionId })}>
              <FileJson2 size={16} />
              <span><strong>Payload Viewer</strong><small>Inspect safe message metadata and controls</small></span>
            </Link>
            <Link to={toolHref('logs', { transactionId })}>
              <ListTree size={16} />
              <span><strong>Processing Log</strong><small>Find the last successful checkpoint</small></span>
            </Link>
          </>
        )}
        {errorId && (
          <Link to={toolHref('errors', { errorId })}>
            <AlertTriangle size={16} />
            <span><strong>Error Detail</strong><small>Verify stage, category, and error code</small></span>
          </Link>
        )}
        {mappingIncident && (
          <Link to="/learn/tools/mappings">
            <SlidersHorizontal size={16} />
            <span><strong>Mapping Viewer</strong><small>{mission.scenarioKey === 'X12_214_WRONG_VERSION' ? 'Compare the active Midwest X12 profile version' : 'Compare the active Midwest profile with AT7-01'}</small></span>
          </Link>
        )}
      </div>
    </article>
  );
}

function toolHref(tool: string, values: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => params.set(key, value));
  return `/learn/tools/${tool}?${params.toString()}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatDirectoryReadiness(value: unknown): string {
  const directories = readRecord(value);
  if (!directories) return 'Pending';
  return Object.entries(directories)
    .map(([name, ready]) => `/${name}: ${ready === true ? 'READY' : 'NOT READY'}`)
    .join(' · ');
}


function ChoicePanel({
  testId,
  title,
  prompt,
  options,
  selected,
  correctId,
  disabled = false,
  onSelect,
}: {
  testId: string;
  title: string;
  prompt: string;
  options: IncidentOption[];
  selected: string | null;
  correctId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const selectedOption = options.find((option) => option.id === selected);
  const answered = selected !== null;
  const correct = selected === correctId;

  return (
    <article className={`panel ${disabled ? 'disabled-panel' : ''}`} data-testid={testId}>
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <p>{prompt}</p>
      <div className="knowledge-options" role="radiogroup" aria-label={prompt}>
        {options.map((option) => (
          <button
            key={option.id}
            className={selected === option.id ? 'selected' : ''}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {answered && selectedOption && (
        <div className={`knowledge-feedback ${correct ? 'correct' : 'incorrect'}`}>
          {correct ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <p>{selectedOption.explanation}</p>
        </div>
      )}
    </article>
  );
}

function labelForStatus(status: IncidentStatus): string {
  if (status === 'NOT_REACHED') return 'NOT REACHED';
  return status;
}

function phaseOrder(phase: MissionPhase): number {
  return missionPhases.indexOf(phase);
}

function generateIncidentLoadId(missionNumber: number): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return `INC${missionNumber}${suffix}`.slice(0, 30);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
  if (value === null || value === undefined) return 'Evidence pending.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

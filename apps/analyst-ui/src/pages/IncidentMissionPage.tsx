import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
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
  trainingMissions,
} from '../training/missions';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { IncidentMissionDefinition, IncidentOption, IncidentStatus, MissionPhase } from '../training/types';

type RecoveryState = 'IDLE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export function IncidentMissionPage() {
  const { missionSlug } = useParams();
  const mission = findIncidentMissionBySlug(missionSlug);

  if (!mission) {
    return <Navigate to="/learn" replace />;
  }

  const progress = loadTrainingProgress();
  const roadmapMission = trainingMissions.find((candidate) => candidate.id === mission.id);
  const prerequisiteSatisfied =
    !roadmapMission?.unlocksAfter ||
    hasCompletedMission(progress, roadmapMission.unlocksAfter) ||
    hasCompletedMission(progress, mission.id);

  if (!prerequisiteSatisfied) {
    return <Navigate to="/learn" replace />;
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
  const canDiagnose = lastHealthyId === mission.correctLastHealthyId && diagnosisId === mission.correctDiagnosisId;
  const canPlan = planId === mission.correctPlanId;
  const recoveryCorrelated = Boolean(
    incidentRun &&
    recoveryRun &&
    recoveryRun.businessIdentifier === incidentRun.businessIdentifier
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
    try {
      const created = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: generateIncidentLoadId(mission.missionNumber),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Training Incident Freight',
      });
      const executed = await runNextLabStep(token, created.id);
      setIncidentRun(executed.run);
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

  function finishMission() {
    if (!canReport) return;
    completeMission(mission.id);
    setCompleted(true);
    setPhase('DEBRIEF');
  }

  return (
    <section className="training-stack" data-testid="incident-mission-page">
      <Link className="secondary-button training-back-link" to="/learn">
        <ArrowLeft size={16} />
        Training Desk
      </Link>

      <MissionBriefing>
        <p className="eyebrow">Mission {mission.missionNumber} - Beginner Incident</p>
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
            <MissionObjective done={Boolean(incidentRun)}>Run the real {mission.scenarioKey} failure drill.</MissionObjective>
            <MissionObjective done={phaseOrder(phase) >= phaseOrder('INVESTIGATE')}>Inspect FreightBridge evidence.</MissionObjective>
            <MissionObjective done={lastHealthyId === mission.correctLastHealthyId}>Choose the last healthy checkpoint.</MissionObjective>
            <MissionObjective done={diagnosisId === mission.correctDiagnosisId}>Diagnose where the flow stopped.</MissionObjective>
            <MissionObjective done={planId === mission.correctPlanId}>Choose a safe remediation plan.</MissionObjective>
            <MissionObjective done={recoveryState === 'SUCCEEDED'}>Verify recovery with a healthy Lab retry.</MissionObjective>
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
            <h2>Healthy Baseline Comparison</h2>
          </div>
          <p className="muted-text">
            In Mission 1, a healthy flow reached authentication, parsing, validation, canonical shipment, 204, SFTP, 997, 990, 214, and Apex-facing update evidence.
          </p>
          <p>
            This incident asks you to identify the first point where the real failure drill diverged from that baseline.
          </p>
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
        <section className="training-stack" data-testid="incident-workspace">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">FreightBridge Failure Drill</p>
                <h2>{mission.scenarioKey}</h2>
              </div>
              <span className="badge badge-danger">Incident observed</span>
            </div>
            <dl className="definition-grid">
              <div><dt>Scenario</dt><dd>{incidentRun.scenarioKey}</dd></div>
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

          <article className="panel">
            <div className="panel-header">
              <h2>Evidence Checkpoints</h2>
            </div>
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

          <section className="content-grid workstation-grid">
            <HintPanel hints={mission.hints} />
            <AnalystNotes storageKey={`freightbridge.trainingNotes.${mission.id}`} />
          </section>

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
            disabled={lastHealthyId !== mission.correctLastHealthyId}
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
              {mission.remediationLabel}. FreightBridge will retry the same incident load through the clean
              training path, then verify that the previously failing flow now progresses normally.
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
              <dl className="definition-grid">
                <div><dt>Incident Load</dt><dd>{incidentRun.businessIdentifier}</dd></div>
                <div><dt>Recovery Scenario</dt><dd>{recoveryRun.scenarioKey}</dd></div>
                <div><dt>Recovery Load</dt><dd>{recoveryRun.businessIdentifier}</dd></div>
                <div>
                  <dt>Correlation</dt>
                  <dd data-testid="recovery-correlation">
                    {recoveryCorrelated ? 'MATCHED - same incident load' : 'MISMATCH'}
                  </dd>
                </div>
                <div><dt>Recovery Status</dt><dd>{recoveryRun.status}</dd></div>
                <div><dt>Tender Status</dt><dd>{String(recoveryRun.resultSummary.tenderStatus ?? 'Pending')}</dd></div>
                <div><dt>Shipment Status</dt><dd>{String(recoveryRun.resultSummary.shipmentStatus ?? 'Pending')}</dd></div>
              </dl>
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
                    ? `${recoveryRun.status}; ${recoveryCorrelated ? 'same load correlated' : 'load correlation mismatch'}`
                    : 'Not recorded'}
                </dd>
              </div>
            </dl>
          </section>
          <ul className="check-list">
            {mission.debrief.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="lab-actions">
            <Link className="primary-button" to="/learn">Return to Training Desk</Link>
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

function generateRecoveryLoadId(missionNumber: number): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return `REC${missionNumber}${suffix}`.slice(0, 30);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

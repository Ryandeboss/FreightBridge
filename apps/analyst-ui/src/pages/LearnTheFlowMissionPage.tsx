import { AlertTriangle, ArrowLeft, CheckCircle2, Play, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  AnalystNotes,
  CheckpointTimeline,
  CommunicationMessage,
  EntityCard,
  FinalHealthyReview,
  FollowThisLoad,
  HealthyFlowChecklist,
  HintPanel,
  KnowledgeCheck,
  LastHealthyCheckpoint,
  MissionBriefing,
  MissionCheckpoint,
  MissionObjective,
  MissionPhaseProgress,
  MissionProgress,
  ReplayButton,
  TechnicalComparison,
  type CheckpointView,
} from '../components/training/TrainingComponents';
import {
  checkpointQuestions,
  healthyChecklistItems,
  healthyCheckpoints,
  LEARN_THE_FLOW_MISSION_ID,
  missionOneBriefing,
  missionOneHints,
  missionOnePhases,
  samplePartnerMessages,
  trainingEntities,
} from '../training/missions';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { HealthyCheckpoint, MissionPhase } from '../training/types';
import {
  find204Dispatch,
  find204Preview,
  findApexPayload,
  findCanonicalShipment,
  findStep,
  locationLine,
  shipmentEvents,
} from '../training/labEvidence';

type Answers = Record<string, string | null>;

const initialAnswers: Answers = Object.fromEntries(checkpointQuestions.map((question) => [question.id, null]));
const NOTES_KEY = 'freightbridge.trainingNotes.LEARN_THE_FLOW';

export function LearnTheFlowMissionPage() {
  const { token, handleApiError } = useOperationsSession();
  const [run, setRun] = useState<LabRun | null>(null);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [finalReviewSelections, setFinalReviewSelections] = useState<string[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const progress = loadTrainingProgress();
  const alreadyCompleted = hasCompletedMission(progress, LEARN_THE_FLOW_MISSION_ID);
  const lifecycleSucceeded = run?.status === 'SUCCEEDED';
  const lifecycleFailed = run?.status === 'FAILED';
  const technicalAckSeen = hasTechnicalAck(run);
  const tenderResponseSeen = hasTenderResponse(run);
  const apexPayload = useMemo(() => findApexPayload(run), [run]);
  const canonicalShipment = useMemo(() => findCanonicalShipment(run), [run]);
  const dispatch204 = useMemo(() => find204Dispatch(run), [run]);
  const preview204 = useMemo(() => find204Preview(run), [run]);
  const events = useMemo(() => shipmentEvents(run), [run]);
  const checkpointViews = useMemo(
    () => buildCheckpointViews(run, apexPayload, canonicalShipment, dispatch204, preview204, events),
    [run, apexPayload, canonicalShipment, dispatch204, preview204, events],
  );
  const unlockedCheckpointIds = checkpointViews
    .filter((view) => view.status !== 'PENDING')
    .map((view) => view.checkpoint.id);
  const requiredQuestions = checkpointQuestions.filter((question) =>
    checkpointViews.some((view) => view.checkpoint.questionId === question.id && view.status !== 'PENDING'),
  );
  const requiredQuestionsCorrect = requiredQuestions.every((question) => answers[question.id] === question.correctOptionId);
  const finalReviewCorrect = healthyChecklistItems.every((item) => finalReviewSelections.includes(item.id));
  const canComplete = Boolean(lifecycleSucceeded && requiredQuestionsCorrect && finalReviewCorrect);
  const currentPhase: MissionPhase = lifecycleSucceeded ? 'DEBRIEF' : run ? 'INVESTIGATE' : 'BRIEFING';
  const currentStage = currentCheckpoint(checkpointViews)?.checkpoint.title ?? 'Ready to start';
  const currentResult = lifecycleSucceeded
    ? 'Healthy lifecycle complete'
    : run
      ? 'Evidence still progressing'
      : 'No run started';
  const completedObjectives = [
    Boolean(run),
    unlockedCheckpointIds.includes('inbound-apex'),
    unlockedCheckpointIds.includes('canonical'),
    unlockedCheckpointIds.includes('x12-204'),
    technicalAckSeen,
    tenderResponseSeen,
    events.length > 0,
    lifecycleSucceeded,
    requiredQuestionsCorrect,
    finalReviewCorrect,
  ].filter(Boolean).length;
  const nextActionDisabled = isWorking || lifecycleFailed || Boolean(run?.status === 'SUCCEEDED');

  async function startMission() {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    setCompleted(false);
    setAnswers(initialAnswers);
    setFinalReviewSelections([]);
    try {
      const nextRun = await createLabRun(token, {
        scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
        loadId: generateTrainingLoadId(),
        commodityDescription: 'Industrial Components',
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
      });
      setRun(nextRun);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Training shipment could not be created.');
    } finally {
      setIsWorking(false);
    }
  }

  async function continueMission() {
    if (!token || !run || run.status === 'SUCCEEDED') return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await runNextLabStep(token, run.id);
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Training shipment hit an unexpected system failure.');
    } finally {
      setIsWorking(false);
    }
  }

  function answer(questionId: string, optionId: string) {
    setAnswers((current) => ({ ...current, [questionId]: optionId }));
  }

  function toggleFinalReview(id: string) {
    setFinalReviewSelections((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function finishMission() {
    if (!canComplete) return;
    completeMission(LEARN_THE_FLOW_MISSION_ID);
    setCompleted(true);
  }

  return (
    <section className="training-stack" data-testid="learn-the-flow-mission-page">
      <Link className="secondary-button training-back-link" to="/learn">
        <ArrowLeft size={16} />
        Training Desk
      </Link>

      <MissionBriefing>
        <p className="eyebrow">Mission 1 - Your First Shift</p>
        <h1>Watch a Healthy Integration</h1>
        <p>
          Before you troubleshoot failures, learn what normal looks like from inside FreightBridge.
        </p>
        <MissionPhaseProgress phases={missionOnePhases} current={currentPhase} />
      </MissionBriefing>

      <CommunicationMessage message={missionOneBriefing} />

      {alreadyCompleted && !run && (
        <article className="panel replay-panel" data-testid="completed-mission-review">
          <div className="panel-header">
            <h2>Mission 1 Complete</h2>
            <CheckCircle2 size={22} />
          </div>
          <p className="muted-text">
            Your LEARN_THE_FLOW progress is still recognized. Review the healthy baseline below or replay the mission with a new real Lab run.
          </p>
          <div className="lab-actions">
            <ReplayButton onReplay={startMission} disabled={isWorking} />
          </div>
        </article>
      )}

      <section className="entity-flow" aria-label="FreightBridge workplace and external partners">
        {trainingEntities.map((entity) => (
          <EntityCard key={entity.name} entity={entity} />
        ))}
      </section>

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h2>Mission Objectives</h2>
            <MissionProgress completed={completedObjectives} total={10} />
          </div>
          <div className="mission-objectives">
            <MissionObjective done={Boolean(run)}>Start a real FULL_SHIPMENT_LIFECYCLE lab run.</MissionObjective>
            <MissionObjective done={unlockedCheckpointIds.includes('inbound-apex')}>Identify the inbound Apex checkpoint.</MissionObjective>
            <MissionObjective done={unlockedCheckpointIds.includes('canonical')}>Recognize canonical shipment evidence.</MissionObjective>
            <MissionObjective done={unlockedCheckpointIds.includes('x12-204')}>Explain who generated the 204.</MissionObjective>
            <MissionObjective done={technicalAckSeen}>Separate 997 technical acknowledgment from acceptance.</MissionObjective>
            <MissionObjective done={tenderResponseSeen}>Identify the 990 business response.</MissionObjective>
            <MissionObjective done={events.length > 0}>Recognize 214 status events.</MissionObjective>
            <MissionObjective done={Boolean(lifecycleSucceeded)}>Reach the real lifecycle success state.</MissionObjective>
            <MissionObjective done={requiredQuestionsCorrect}>Complete checkpoint knowledge checks.</MissionObjective>
            <MissionObjective done={finalReviewCorrect}>Complete the final healthy-flow review.</MissionObjective>
          </div>
          <div className="lab-actions">
            {!run ? (
              <button className="primary-button" type="button" onClick={startMission} disabled={isWorking}>
                <Play size={16} />
                Start Mission
              </button>
            ) : (
              <button className="primary-button" type="button" onClick={continueMission} disabled={nextActionDisabled}>
                <RefreshCw size={16} />
                Continue
              </button>
            )}
            {run && <ReplayButton onReplay={startMission} disabled={isWorking} />}
            <Link className="secondary-button" to="/lab">
              Open in Advanced Console
            </Link>
          </div>
        </article>

        <FollowThisLoad
          loadId={run?.businessIdentifier}
          labRunId={run?.id}
          currentStage={currentStage}
          currentResult={currentResult}
        />
      </section>

      <article className="panel" data-testid="checkpoint-timeline-panel">
        <div className="panel-header">
          <h2>FreightBridge Event Timeline</h2>
        </div>
        <CheckpointTimeline checkpoints={checkpointViews} />
      </article>

      {(error || lifecycleFailed) && (
        <article className="panel training-alert" role="alert">
          <AlertTriangle size={20} />
          <div>
            <h2>The training shipment hit an unexpected system failure.</h2>
            <p>{error ?? 'The real Integration Lab run did not complete successfully.'}</p>
            <Link className="secondary-button" to={run ? `/lab/runs/${run.id}` : '/lab'}>
              Open in Advanced Console
            </Link>
          </div>
        </article>
      )}

      <section className="content-grid workstation-grid" data-testid="training-workstation">
        <div className="training-stack">
          <HintPanel hints={missionOneHints} />
          <AnalystNotes storageKey={NOTES_KEY} />
        </div>
        <TechnicalComparison />
      </section>

      <section className="checkpoint-list" data-testid="mission-checkpoints">
        {checkpointViews.map((view) => {
          const question = checkpointQuestions.find((candidate) => candidate.id === view.checkpoint.questionId);
          return (
            <MissionCheckpoint key={view.checkpoint.id} view={view}>
              {question && view.status !== 'PENDING' && (
                <KnowledgeCheck
                  question={question}
                  selected={answers[question.id]}
                  onAnswer={(optionId) => answer(question.id, optionId)}
                />
              )}
            </MissionCheckpoint>
          );
        })}
      </section>

      {lifecycleSucceeded && (
        <section className="training-stack" data-testid="mission-debrief">
          <article className="panel">
            <div className="panel-header">
              <h2>Debrief</h2>
            </div>
            <div className="flow-summary">
              <p><strong>What happened?</strong> Apex sent a load to FreightBridge, FreightBridge normalized it, generated a Midwest 204, delivered it over SFTP, received a 997, received a 990 acceptance, processed 214 status events, and verified broker-facing status evidence.</p>
              <p><strong>What proved it?</strong> Each checkpoint produced FreightBridge-owned evidence: partner request data, canonical shipment data, X12 control numbers, SFTP metadata, acknowledgment controls, tender status, and shipment events.</p>
              <p><strong>What should you remember?</strong> Do not start by guessing. Find the last healthy checkpoint and identify where the evidence stops.</p>
            </div>
          </article>

          <HealthyFlowChecklist items={healthyChecklistItems} />
          <LastHealthyCheckpoint
            label="Healthy Flow Confirmed"
            explanation="The last stage where FreightBridge has evidence that processing succeeded is the completed lifecycle. In future incidents, compare the broken flow to this baseline and find where evidence diverges."
          />
          <FinalHealthyReview
            items={healthyChecklistItems}
            selected={finalReviewSelections}
            onToggle={toggleFinalReview}
            reviewed={finalReviewCorrect}
          />

          <article className={`panel mission-complete-panel ${completed ? 'visible' : ''}`}>
            <div className="panel-header">
              <h2>Mission Completion</h2>
              {completed && <CheckCircle2 size={24} />}
            </div>
            {completed ? (
              <>
                <h3>MISSION COMPLETE - Your First Shift</h3>
                <p>That is your healthy baseline for future FreightBridge incidents.</p>
                <div className="lab-actions">
                  <Link className="primary-button" to="/learn">Return to Training Desk</Link>
                  <ReplayButton onReplay={startMission} disabled={isWorking} />
                </div>
              </>
            ) : (
              <>
                <p className="muted-text">
                  Mission 1 can only complete after the real lifecycle succeeds, checkpoint questions are correct, and the final review is complete.
                </p>
                <button className="primary-button" type="button" disabled={!canComplete} onClick={finishMission}>
                  Complete Mission
                </button>
              </>
            )}
          </article>
        </section>
      )}

      <section className="content-grid two-column" aria-label="Synthetic partner communication examples">
        {samplePartnerMessages.map((message) => (
          <CommunicationMessage key={message.from} message={message} />
        ))}
      </section>
    </section>
  );
}

function generateTrainingLoadId(): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return `TRAIN${suffix}`.slice(0, 30);
}

function buildCheckpointViews(
  run: LabRun | null,
  apexPayload: Record<string, unknown>,
  canonicalShipment: Record<string, unknown>,
  dispatch204: Record<string, unknown> | null,
  preview204: Record<string, unknown> | null,
  events: Record<string, unknown>[],
): CheckpointView[] {
  const available = new Set<string>();
  if (run) available.add('inbound-apex');
  if (hasApexPayload(run, apexPayload)) available.add('validation');
  if (Object.keys(canonicalShipment).length > 0) available.add('canonical');
  if (preview204) available.add('x12-204');
  if (dispatch204) available.add('sftp-delivery');
  if (hasTechnicalAck(run)) available.add('x12-997');
  if (hasTenderResponse(run)) available.add('x12-990');
  if (events.length > 0) available.add('x12-214');
  if (events.length > 0 || hasTenderResponse(run)) available.add('apex-update');
  if (run?.status === 'SUCCEEDED') available.add('healthy-confirmed');
  const firstPending = healthyCheckpoints.find((checkpoint) => !available.has(checkpoint.id))?.id;

  return healthyCheckpoints.map((checkpoint) => ({
    checkpoint,
    status: available.has(checkpoint.id) ? 'COMPLETE' : checkpoint.id === firstPending ? 'CURRENT' : 'PENDING',
    rawEvidence: rawEvidenceFor(checkpoint, run, apexPayload, canonicalShipment, dispatch204, preview204, events),
    values: valuesFor(checkpoint, run, apexPayload, canonicalShipment, dispatch204, preview204, events),
  }));
}

function hasApexPayload(run: LabRun | null, apexPayload: Record<string, unknown>): boolean {
  return Boolean(
    run &&
    (
      Object.keys(apexPayload).length > 0 ||
      stepSucceeded(run, 'CREATE_APEX_LOAD') ||
      stepSucceeded(run, 'DISPATCH_APEX_TENDER')
    ),
  );
}

function hasTechnicalAck(run: LabRun | null): boolean {
  const value = String(run?.resultSummary.technicalAcknowledgment ?? 'PENDING');
  return Boolean(run && value !== 'PENDING' && value !== 'NOT_RECEIVED');
}

function hasTenderResponse(run: LabRun | null): boolean {
  const value = String(run?.resultSummary.tenderStatus ?? 'PENDING');
  return Boolean(run && value !== 'PENDING');
}

function stepSucceeded(run: LabRun | null, stepKey: string): boolean {
  return findStep(run, stepKey)?.status === 'SUCCEEDED';
}

function currentCheckpoint(checkpoints: CheckpointView[]): CheckpointView | null {
  return checkpoints.find((view) => view.status === 'CURRENT') ?? checkpoints.filter((view) => view.status === 'COMPLETE').at(-1) ?? null;
}

function rawEvidenceFor(
  checkpoint: HealthyCheckpoint,
  run: LabRun | null,
  apexPayload: Record<string, unknown>,
  canonicalShipment: Record<string, unknown>,
  dispatch204: Record<string, unknown> | null,
  preview204: Record<string, unknown> | null,
  events: Record<string, unknown>[],
): unknown {
  switch (checkpoint.id) {
    case 'inbound-apex':
    case 'validation':
      return apexPayload;
    case 'canonical':
      return canonicalShipment;
    case 'x12-204':
      return preview204?.x12 ?? preview204;
    case 'sftp-delivery':
      return dispatch204;
    case 'x12-997':
      return run?.resultSummary.technicalAcknowledgmentDetail ?? run?.resultSummary.technicalAcknowledgment;
    case 'x12-990':
      return { tenderStatus: run?.resultSummary.tenderStatus };
    case 'x12-214':
      return events;
    case 'apex-update':
      return {
        tenderStatus: run?.resultSummary.tenderStatus,
        shipmentStatus: run?.resultSummary.shipmentStatus,
        shipmentEvents: events.length,
      };
    case 'healthy-confirmed':
      return run?.resultSummary;
    default:
      return undefined;
  }
}

function valuesFor(
  checkpoint: HealthyCheckpoint,
  run: LabRun | null,
  apexPayload: Record<string, unknown>,
  canonicalShipment: Record<string, unknown>,
  dispatch204: Record<string, unknown> | null,
  preview204: Record<string, unknown> | null,
  events: Record<string, unknown>[],
): Record<string, string | number | null | undefined> | undefined {
  switch (checkpoint.id) {
    case 'inbound-apex':
      return {
        'Load ID': String(apexPayload.loadId ?? run?.businessIdentifier ?? 'Pending'),
        Partner: 'Apex Logistics',
        Transport: 'REST API',
        Format: 'JSON',
      };
    case 'validation':
      return {
        'HTTP / app result': String(findStep(run, 'DISPATCH_APEX_TENDER')?.status ?? findStep(run, 'CREATE_APEX_LOAD')?.status ?? 'Evidence pending'),
        'Business ID': run?.businessIdentifier,
      };
    case 'canonical':
      return {
        'Shipment Number': String(canonicalShipment.shipmentNumber ?? run?.businessIdentifier ?? 'Pending'),
        Origin: locationLine(canonicalShipment.pickup ?? apexPayload.pickup),
        Destination: locationLine(canonicalShipment.delivery ?? apexPayload.delivery),
        Equipment: String(canonicalShipment.equipmentType ?? apexPayload.equipmentType ?? 'Pending'),
      };
    case 'x12-204':
      return {
        ISA13: String(preview204?.interchangeControlNumber ?? 'Pending'),
        GS06: String(preview204?.groupControlNumber ?? 'Pending'),
        ST02: String(preview204?.transactionControlNumber ?? 'Pending'),
        'Generated By': 'FreightBridge',
      };
    case 'sftp-delivery':
      return {
        'File Name': String(dispatch204?.fileName ?? preview204?.fileName ?? 'Pending'),
        'Remote Path': String(dispatch204?.remotePath ?? preview204?.remotePath ?? 'Pending'),
        Transport: 'SFTP',
      };
    case 'x12-997':
      return {
        AK5: String(asRecord(run?.resultSummary.technicalAcknowledgmentDetail)?.ak5 ?? 'Pending'),
        AK9: String(asRecord(run?.resultSummary.technicalAcknowledgmentDetail)?.ak9 ?? 'Pending'),
        'Acknowledged GS06': String(asRecord(run?.resultSummary.technicalAcknowledgmentDetail)?.acknowledgedGroupControlNumber ?? 'Pending'),
        'Acknowledged ST02': String(asRecord(run?.resultSummary.technicalAcknowledgmentDetail)?.acknowledgedTransactionControlNumber ?? 'Pending'),
      };
    case 'x12-990':
      return {
        'Tender Decision': String(run?.resultSummary.tenderStatus ?? 'Pending'),
        'Business Meaning': 'Carrier tender response',
      };
    case 'x12-214':
      return {
        'Events Received': events.length,
        'Current Status': String(run?.resultSummary.shipmentStatus ?? 'Pending'),
        'Event Time Lesson': 'Occurred time may differ from received time',
      };
    case 'apex-update':
      return {
        'Tender Status': String(run?.resultSummary.tenderStatus ?? 'Pending'),
        'Shipment Status': String(run?.resultSummary.shipmentStatus ?? 'Pending'),
        'Evidence Boundary': 'FreightBridge callback/reconciliation evidence',
      };
    case 'healthy-confirmed':
      return {
        Scenario: run?.scenarioKey,
        'Run Status': run?.status,
        'Business ID': run?.businessIdentifier,
      };
    default:
      return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

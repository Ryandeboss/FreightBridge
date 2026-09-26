import { AlertTriangle, ArrowLeft, CheckCircle2, Play, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  AnalystNotes,
  CommunicationMessage,
  EntityCard,
  EvidenceCard,
  EvidencePanel,
  HintPanel,
  KnowledgeCheck,
  MissionBriefing,
  MissionObjective,
  MissionPhaseProgress,
  MissionProgress,
} from '../components/training/TrainingComponents';
import {
  finalQuizQuestions,
  LEARN_THE_FLOW_MISSION_ID,
  missionOneBriefing,
  missionOneHints,
  missionOnePhases,
  missionOneTeachingSteps,
  missionOneTimeline,
  samplePartnerMessages,
  technicalAckQuestion,
  tenderResponseQuestion,
  trainingEntities,
} from '../training/missions';
import { completeMission } from '../training/progress';
import type { MissionPhase, TeachingStep, TrainingEvidence } from '../training/types';
import {
  find204Dispatch,
  find204Preview,
  findApexPayload,
  findCanonicalShipment,
  locationLine,
  rawEvidence,
  shipmentEvents,
} from '../training/labEvidence';

type Answers = Record<string, string | null>;

const initialAnswers: Answers = {
  [technicalAckQuestion.id]: null,
  [tenderResponseQuestion.id]: null,
  ...Object.fromEntries(finalQuizQuestions.map((question) => [question.id, null])),
};

const NOTES_KEY = 'freightbridge.trainingNotes.LEARN_THE_FLOW';

export function LearnTheFlowMissionPage() {
  const { token, handleApiError } = useOperationsSession();
  const [run, setRun] = useState<LabRun | null>(null);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const technicalAckSeen = String(run?.resultSummary.technicalAcknowledgment ?? 'PENDING') !== 'PENDING';
  const tenderResponseSeen = String(run?.resultSummary.tenderStatus ?? 'PENDING') !== 'PENDING';
  const lifecycleSucceeded = run?.status === 'SUCCEEDED';
  const lifecycleFailed = run?.status === 'FAILED';
  const technicalAckCorrect = answers[technicalAckQuestion.id] === technicalAckQuestion.correctOptionId;
  const tenderResponseCorrect = answers[tenderResponseQuestion.id] === tenderResponseQuestion.correctOptionId;
  const finalQuizCorrect = finalQuizQuestions.every((question) => answers[question.id] === question.correctOptionId);
  const canComplete = lifecycleSucceeded && technicalAckCorrect && tenderResponseCorrect && finalQuizCorrect;
  const completedObjectives = [
    Boolean(run),
    lifecycleSucceeded,
    technicalAckCorrect,
    tenderResponseCorrect,
    finalQuizCorrect,
  ].filter(Boolean).length;
  const nextActionDisabled =
    isWorking ||
    lifecycleFailed ||
    (technicalAckSeen && !technicalAckCorrect) ||
    (tenderResponseSeen && !tenderResponseCorrect);

  const apexPayload = useMemo(() => findApexPayload(run), [run]);
  const canonicalShipment = useMemo(() => findCanonicalShipment(run), [run]);
  const dispatch204 = useMemo(() => find204Dispatch(run), [run]);
  const preview204 = useMemo(() => find204Preview(run), [run]);
  const events = useMemo(() => shipmentEvents(run), [run]);
  const currentPhase: MissionPhase = lifecycleSucceeded ? 'DEBRIEF' : run ? 'INVESTIGATE' : 'BRIEFING';
  const evidenceCards = useMemo(
    () => buildMissionEvidence(run, apexPayload, canonicalShipment, dispatch204, preview204, events),
    [run, apexPayload, canonicalShipment, dispatch204, preview204, events],
  );

  async function startMission() {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    setCompleted(false);
    setAnswers(initialAnswers);
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
          You are at FreightBridge. Before troubleshooting incidents, learn what a healthy partner
          integration looks like from your workstation.
        </p>
        <MissionPhaseProgress phases={missionOnePhases} current={currentPhase} />
      </MissionBriefing>

      <CommunicationMessage message={missionOneBriefing} />

      <section className="entity-flow" aria-label="FreightBridge workplace and external partners">
        {trainingEntities.map((entity) => (
          <EntityCard key={entity.name} entity={entity} />
        ))}
      </section>

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h2>Mission Objectives</h2>
            <MissionProgress completed={completedObjectives} total={5} />
          </div>
          <div className="mission-objectives">
            <MissionObjective done={Boolean(run)}>Start a real FULL_SHIPMENT_LIFECYCLE lab run.</MissionObjective>
            <MissionObjective done={lifecycleSucceeded}>Run the lifecycle to success.</MissionObjective>
            <MissionObjective done={technicalAckCorrect}>Explain why 997 is not load acceptance.</MissionObjective>
            <MissionObjective done={tenderResponseCorrect}>Identify 990 as the tender response.</MissionObjective>
            <MissionObjective done={finalQuizCorrect}>Pass the final beginner quiz.</MissionObjective>
          </div>
          <div className="lab-actions">
            {!run ? (
              <button className="primary-button" type="button" onClick={startMission} disabled={isWorking}>
                <Play size={16} />
                Start Mission
              </button>
            ) : (
              <button className="primary-button" type="button" onClick={continueMission} disabled={nextActionDisabled || lifecycleSucceeded}>
                <RefreshCw size={16} />
                Continue
              </button>
            )}
            <Link className="secondary-button" to="/lab">
              Open in Advanced Console
            </Link>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>FreightBridge Event Timeline</h2>
          </div>
          <ol className="timeline workstation-timeline">
            {missionOneTimeline.map((event, index) => (
              <li key={event}>
                <span>Step {index + 1}</span>
                <strong>{event}</strong>
              </li>
            ))}
          </ol>
        </article>
      </section>

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
        <article className="panel">
          <div className="panel-header">
            <h2>Evidence</h2>
          </div>
          <div className="evidence-list">
            {evidenceCards.map((evidence) => (
              <EvidenceCard key={evidence.id} evidence={evidence} />
            ))}
          </div>
        </article>
        <div className="training-stack">
          <HintPanel hints={missionOneHints} />
          <AnalystNotes storageKey={NOTES_KEY} />
        </div>
      </section>

      <section className="teaching-grid">
        {missionOneTeachingSteps.slice(0, 4).map((step, index) => (
          <TeachingCard
            key={step.id}
            step={step}
            evidenceTitle={index === 0 ? 'Inspect Raw Data' : index === 2 ? 'Inspect Raw X12' : 'Inspect Raw Data'}
            evidence={index === 0 ? apexPayload : index === 1 ? canonicalShipment : index === 2 ? String(preview204?.x12 ?? '204 preview pending.') : dispatch204}
          >
            {index === 0 && (
              <dl className="definition-grid">
                <div><dt>Load ID</dt><dd>{String(apexPayload.loadId ?? run?.businessIdentifier ?? 'Pending')}</dd></div>
                <div><dt>Origin</dt><dd>{locationLine(apexPayload.pickup)}</dd></div>
                <div><dt>Destination</dt><dd>{locationLine(apexPayload.delivery)}</dd></div>
                <div><dt>BOL</dt><dd>{String(apexPayload.bolNumber ?? 'Pending')}</dd></div>
                <div><dt>PO</dt><dd>{String(apexPayload.purchaseOrderNumber ?? 'Pending')}</dd></div>
                <div><dt>Customer Reference</dt><dd>{String(apexPayload.customerReference ?? 'Pending')}</dd></div>
              </dl>
            )}
            {index === 2 && (
              <dl className="definition-grid">
                <div><dt>Document</dt><dd>X12 204</dd></div>
                <div><dt>Simple meaning</dt><dd>Will you haul this load?</dd></div>
                <div><dt>Generated by</dt><dd>FreightBridge</dd></div>
              </dl>
            )}
          </TeachingCard>
        ))}
      </section>

      {technicalAckSeen && (
        <section className="training-stack">
          <TeachingCard
            step={missionOneTeachingSteps[4]}
            evidenceTitle="Inspect 997 Details"
            evidence={run?.resultSummary.technicalAcknowledgmentDetail ?? run?.resultSummary.technicalAcknowledgment}
          />
          <KnowledgeCheck
            question={technicalAckQuestion}
            selected={answers[technicalAckQuestion.id]}
            onAnswer={(optionId) => answer(technicalAckQuestion.id, optionId)}
          />
        </section>
      )}

      {tenderResponseSeen && technicalAckCorrect && (
        <section className="training-stack">
          <TeachingCard
            step={missionOneTeachingSteps[5]}
            evidenceTitle="Inspect 990 Result"
            evidence={run?.resultSummary.tenderStatus}
          />
          <KnowledgeCheck
            question={tenderResponseQuestion}
            selected={answers[tenderResponseQuestion.id]}
            onAnswer={(optionId) => answer(tenderResponseQuestion.id, optionId)}
          />
        </section>
      )}

      {events.length > 0 && tenderResponseCorrect && (
        <section className="training-stack">
          <TeachingCard
            step={missionOneTeachingSteps[6]}
            evidenceTitle="Inspect 214 Event History"
            evidence={events}
          >
            <div className="status-progression" aria-label="214 status progression">
              {['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'].map((status) => (
                <span key={status}>{status}</span>
              ))}
            </div>
          </TeachingCard>
          <TeachingCard
            step={missionOneTeachingSteps[7]}
            evidenceTitle="Inspect Event-Time Evidence"
            evidence={events}
          />
        </section>
      )}

      {lifecycleSucceeded && tenderResponseCorrect && (
        <section className="training-stack">
          <article className="panel">
            <div className="panel-header">
              <h2>Debrief</h2>
            </div>
            <div className="flow-summary">
              <p><strong>Apex Logistics</strong>: external partner claim/request enters FreightBridge.</p>
              <p><strong>FreightBridge</strong>: authenticates, validates, maps, generates X12, sends, tracks, and logs.</p>
              <p><strong>Midwest Carrier</strong>: external partner messages are visible only when FreightBridge receives files, acknowledgments, or support communication.</p>
              <p><strong>FreightBridge</strong>: callbacks and status updates are verified from our transaction evidence.</p>
            </div>
          </article>

          <section className="final-quiz" aria-label="Final knowledge check">
            {finalQuizQuestions.map((question) => (
              <KnowledgeCheck
                key={question.id}
                question={question}
                selected={answers[question.id]}
                onAnswer={(optionId) => answer(question.id, optionId)}
              />
            ))}
          </section>

          <article className={`panel mission-complete-panel ${completed ? 'visible' : ''}`}>
            <div className="panel-header">
              <h2>Mission Completion</h2>
              {completed && <CheckCircle2 size={24} />}
            </div>
            {completed ? (
              <>
                <h3>MISSION COMPLETE - Your First Shift</h3>
                <p>
                  You followed a shipment from the evidence available to a FreightBridge Integration Support Analyst.
                </p>
                <Link className="primary-button" to="/learn">Return to Training Desk</Link>
              </>
            ) : (
              <>
                <p className="muted-text">
                  Mission 1 can only complete after the real lifecycle succeeds and all knowledge
                  checks are correct.
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

function TeachingCard({
  step,
  evidenceTitle,
  evidence,
  children,
}: {
  step: TeachingStep;
  evidenceTitle: string;
  evidence: unknown;
  children?: ReactNode;
}) {
  return (
    <article className="panel teaching-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{step.source}</p>
          <h2>{step.title}</h2>
        </div>
      </div>
      <div className="observed-meaning-grid">
        <div>
          <h3>Observed by FreightBridge</h3>
          <p>{step.observed}</p>
        </div>
        <div>
          <h3>What this means</h3>
          <p>{step.plainLanguage}</p>
        </div>
      </div>
      {children}
      <EvidencePanel title="What would I check here?">
        <ul className="check-list">
          {step.analystCheck.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </EvidencePanel>
      {step.advancedDetails && (
        <EvidencePanel title="Advanced details">
          <p>{step.advancedDetails}</p>
        </EvidencePanel>
      )}
      <EvidencePanel title={evidenceTitle}>
        <pre className="lab-preview">{rawEvidence(evidence)}</pre>
      </EvidencePanel>
    </article>
  );
}

function buildMissionEvidence(
  run: LabRun | null,
  apexPayload: Record<string, unknown>,
  canonicalShipment: Record<string, unknown>,
  dispatch204: Record<string, unknown> | null,
  preview204: Record<string, unknown> | null,
  events: Record<string, unknown>[],
): TrainingEvidence[] {
  return [
    {
      id: 'inbound-apex',
      type: 'Inbound API Request',
      source: 'FreightBridge API Gateway',
      summary: 'Message received from Apex',
      observed: run ? 'FreightBridge accepted an Apex load-tender workflow into the Lab run.' : 'Waiting for a real Lab run.',
      meaning: 'Apex reached FreightBridge; the next analyst question is whether authentication, parsing, and validation succeeded.',
      timestamp: run?.createdAt,
      businessIdentifier: run?.businessIdentifier,
      raw: apexPayload,
    },
    {
      id: 'canonical',
      type: 'Transaction Record',
      source: 'FreightBridge Domain Processor',
      summary: 'Canonical shipment created',
      observed: Object.keys(canonicalShipment).length > 0 ? 'FreightBridge has normalized shipment data.' : 'Canonical shipment evidence pending.',
      meaning: 'FreightBridge has an internal representation that can be mapped to partner-specific formats.',
      businessIdentifier: run?.businessIdentifier,
      raw: canonicalShipment,
    },
    {
      id: 'x12-204',
      type: 'X12 Document',
      source: 'FreightBridge X12 Mapper',
      summary: '204 generated for Midwest',
      observed: preview204 ? 'FreightBridge generated X12 204 preview/control metadata.' : '204 evidence pending.',
      meaning: 'The integration platform produced the carrier load tender; this is FreightBridge evidence, not Apex internals.',
      businessIdentifier: run?.businessIdentifier,
      raw: preview204?.x12 ?? preview204,
    },
    {
      id: 'sftp-activity',
      type: 'SFTP Activity',
      source: 'FreightBridge SFTP Transport',
      summary: 'SFTP delivery metadata',
      observed: dispatch204 ? 'FreightBridge recorded delivery metadata for the outbound 204.' : 'SFTP activity pending.',
      meaning: 'For carrier complaints, this is where an analyst checks remote path and file delivery disposition.',
      businessIdentifier: run?.businessIdentifier,
      raw: dispatch204,
    },
    {
      id: 'status-history',
      type: 'Shipment Status History',
      source: 'Inbound Midwest EDI',
      summary: '214 event history',
      observed: events.length > 0 ? `${events.length} Midwest status events received by FreightBridge.` : '214 status events pending.',
      meaning: 'FreightBridge can verify received status events and protect current status using business event time.',
      businessIdentifier: run?.businessIdentifier,
      raw: events,
    },
  ];
}

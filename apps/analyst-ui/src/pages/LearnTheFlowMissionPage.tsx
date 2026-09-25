import { AlertTriangle, ArrowLeft, CheckCircle2, Play, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  CharacterMessage,
  EntityCard,
  EvidencePanel,
  KnowledgeCheck,
  MissionBriefing,
  MissionObjective,
  MissionProgress,
} from '../components/training/TrainingComponents';
import {
  finalQuizQuestions,
  LEARN_THE_FLOW_MISSION_ID,
  missionOneTeachingSteps,
  technicalAckQuestion,
  tenderResponseQuestion,
  trainingEntities,
} from '../training/missions';
import { completeMission } from '../training/progress';
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
        Training Home
      </Link>

      <MissionBriefing>
        <p className="eyebrow">Mission 1</p>
        <h1>Learn the Flow</h1>
        <p>
          Before you troubleshoot integrations, you need to understand what a successful one looks
          like. This tutorial follows the real Full Shipment Lifecycle Integration Lab scenario.
        </p>
      </MissionBriefing>

      <CharacterMessage name="Mike" role="Integration Manager">
        <p>
          Before I let you work incidents, I want you to understand what a normal shipment looks
          like. Watch who sends what, and pay close attention to the difference between technical
          acknowledgments and business decisions.
        </p>
      </CharacterMessage>

      <section className="entity-flow" aria-label="Apex to FreightBridge to Midwest flow">
        {trainingEntities.map((entity) => (
          <EntityCard key={entity.name} entity={entity} />
        ))}
      </section>

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

      <section className="teaching-grid">
        <TeachingCard
          title={missionOneTeachingSteps[0].title}
          plainLanguage={missionOneTeachingSteps[0].plainLanguage}
          advancedDetails={missionOneTeachingSteps[0].advancedDetails}
          evidenceTitle="View raw Apex JSON"
          evidence={apexPayload}
        >
          <dl className="definition-grid">
            <div><dt>Load ID</dt><dd>{String(apexPayload.loadId ?? run?.businessIdentifier ?? 'Pending')}</dd></div>
            <div><dt>Origin</dt><dd>{locationLine(apexPayload.pickup)}</dd></div>
            <div><dt>Destination</dt><dd>{locationLine(apexPayload.delivery)}</dd></div>
            <div><dt>BOL</dt><dd>{String(apexPayload.bolNumber ?? 'Pending')}</dd></div>
            <div><dt>PO</dt><dd>{String(apexPayload.purchaseOrderNumber ?? 'Pending')}</dd></div>
            <div><dt>Customer Reference</dt><dd>{String(apexPayload.customerReference ?? 'Pending')}</dd></div>
          </dl>
        </TeachingCard>

        <TeachingCard
          title={missionOneTeachingSteps[1].title}
          plainLanguage={missionOneTeachingSteps[1].plainLanguage}
          advancedDetails={missionOneTeachingSteps[1].advancedDetails}
          evidenceTitle="View canonical shipment"
          evidence={canonicalShipment}
        >
          <p className="muted-text">
            FreightBridge first translates everyone&apos;s information into one internal language.
          </p>
        </TeachingCard>

        <TeachingCard
          title={missionOneTeachingSteps[2].title}
          plainLanguage={missionOneTeachingSteps[2].plainLanguage}
          advancedDetails={missionOneTeachingSteps[2].advancedDetails}
          evidenceTitle="View raw X12"
          evidence={String(preview204?.x12 ?? '204 preview pending.')}
        >
          <dl className="definition-grid">
            <div><dt>Document</dt><dd>X12 204</dd></div>
            <div><dt>Simple meaning</dt><dd>Will you haul this load?</dd></div>
            <div><dt>Generated by</dt><dd>FreightBridge</dd></div>
          </dl>
        </TeachingCard>

        <TeachingCard
          title={missionOneTeachingSteps[3].title}
          plainLanguage={missionOneTeachingSteps[3].plainLanguage}
          advancedDetails={missionOneTeachingSteps[3].advancedDetails}
          evidenceTitle="View SFTP dispatch metadata"
          evidence={dispatch204}
        />
      </section>

      {technicalAckSeen && (
        <section className="training-stack">
          <TeachingCard
            title={missionOneTeachingSteps[4].title}
            plainLanguage={missionOneTeachingSteps[4].plainLanguage}
            advancedDetails={missionOneTeachingSteps[4].advancedDetails}
            evidenceTitle="View 997 details"
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
            title={missionOneTeachingSteps[5].title}
            plainLanguage={missionOneTeachingSteps[5].plainLanguage}
            advancedDetails={missionOneTeachingSteps[5].advancedDetails}
            evidenceTitle="View 990 result"
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
            title={missionOneTeachingSteps[6].title}
            plainLanguage={missionOneTeachingSteps[6].plainLanguage}
            advancedDetails={missionOneTeachingSteps[6].advancedDetails}
            evidenceTitle="View raw 214 event history"
            evidence={events}
          >
            <div className="status-progression" aria-label="214 status progression">
              {['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'].map((status) => (
                <span key={status}>{status}</span>
              ))}
            </div>
          </TeachingCard>
          <TeachingCard
            title={missionOneTeachingSteps[7].title}
            plainLanguage={missionOneTeachingSteps[7].plainLanguage}
            advancedDetails={missionOneTeachingSteps[7].advancedDetails}
            evidenceTitle="View event-time evidence"
            evidence={events}
          />
        </section>
      )}

      {lifecycleSucceeded && tenderResponseCorrect && (
        <section className="training-stack">
          <article className="panel">
            <div className="panel-header">
              <h2>Final Flow Summary</h2>
            </div>
            <div className="flow-summary">
              <p><strong>APEX</strong>: I need this load moved.</p>
              <p>REST / JSON to <strong>FREIGHTBRIDGE</strong>: I&apos;ll translate and track it.</p>
              <p>X12 204 / SFTP to <strong>MIDWEST</strong>: Will you haul this load?</p>
              <p><strong>MIDWEST</strong>: I received it - 997. I accept it - 990. Picked up / in transit / arrived / delivered - 214.</p>
              <p><strong>FREIGHTBRIDGE</strong>: REST / JSON updates back to Apex.</p>
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
                <h3>MISSION COMPLETE - Learn the Flow</h3>
                <p>
                  You successfully followed a shipment from Apex, through FreightBridge, to Midwest
                  and back.
                </p>
                <Link className="primary-button" to="/learn">Return to Training Home</Link>
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
    </section>
  );
}

function generateTrainingLoadId(): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return `TRAIN${suffix}`.slice(0, 30);
}

function TeachingCard({
  title,
  plainLanguage,
  advancedDetails,
  evidenceTitle,
  evidence,
  children,
}: {
  title: string;
  plainLanguage: string;
  advancedDetails?: string;
  evidenceTitle: string;
  evidence: unknown;
  children?: ReactNode;
}) {
  return (
    <article className="panel teaching-card">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <p>{plainLanguage}</p>
      {children}
      {advancedDetails && (
        <EvidencePanel title="Advanced details">
          <p>{advancedDetails}</p>
        </EvidencePanel>
      )}
      <EvidencePanel title={evidenceTitle}>
        <pre className="lab-preview">{rawEvidence(evidence)}</pre>
      </EvidencePanel>
    </article>
  );
}

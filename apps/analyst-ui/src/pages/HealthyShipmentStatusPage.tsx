import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Inbox,
  MapPin,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { executeLabStep, fetchLabRun, type LabRun, type LabStep } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  loadHealthyWalkthroughState,
  saveHealthyShipmentStatusProgress,
} from '../training/healthyWalkthrough';
import { asRecord, findStep, rawEvidence, shipmentEvents } from '../training/labEvidence';

type StatusDefinition = {
  status: 'PICKED_UP' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';
  at7: 'AF' | 'X6' | 'X1' | 'D1';
  label: string;
  meaning: string;
  location: string;
};

const statusDefinitions: StatusDefinition[] = [
  {
    status: 'PICKED_UP',
    at7: 'AF',
    label: 'Picked up',
    meaning: 'Carrier departed the pickup location with the shipment.',
    location: 'Aurora, IL',
  },
  {
    status: 'IN_TRANSIT',
    at7: 'X6',
    label: 'In transit',
    meaning: 'Shipment is moving toward the delivery location.',
    location: 'South Bend, IN',
  },
  {
    status: 'ARRIVED',
    at7: 'X1',
    label: 'Arrived',
    meaning: 'Carrier arrived at the delivery location.',
    location: 'Detroit, MI',
  },
  {
    status: 'DELIVERED',
    at7: 'D1',
    label: 'Delivered',
    meaning: 'Carrier completed unloading at the delivery location.',
    location: 'Detroit, MI',
  },
];

const knowledgeChecks = [
  {
    id: 'purpose',
    prompt: 'What does a 214 communicate in this FreightBridge flow?',
    options: ['Shipment status events', 'Tender acceptance', 'Technical acknowledgment of the 204'],
    answer: 'Shipment status events',
  },
  {
    id: 'mapping',
    prompt: 'Which Midwest AT7 code maps to FreightBridge DELIVERED?',
    options: ['D1', 'X1', 'AF'],
    answer: 'D1',
  },
  {
    id: 'time',
    prompt: 'Why does FreightBridge keep occurred time separate from received time?',
    options: [
      'So late or out-of-order messages do not automatically rewrite business chronology',
      'Because SFTP files cannot contain timestamps',
      'Because Apex does not receive shipment statuses',
    ],
    answer: 'So late or out-of-order messages do not automatically rewrite business chronology',
  },
] as const;

export function HealthyShipmentStatusPage() {
  const { token, handleApiError } = useOperationsSession();
  const saved = loadHealthyWalkthroughState();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(saved?.part4Complete === true);

  useEffect(() => {
    let active = true;

    async function loadSavedRun() {
      if (!token || !saved?.runId || !saved.loadId || saved.part3Complete !== true) return;
      setWorking(true);
      setError(null);
      try {
        const fetchedRun = await fetchLabRun(token, saved.runId);
        if (!active) return;
        setRun(fetchedRun);
        setComplete(saved.part4Complete === true);
      } catch (nextError) {
        if (!active) return;
        handleApiError(nextError);
        setError(nextError instanceof ApiError ? nextError.message : 'The saved Lab run could not be loaded.');
      } finally {
        if (active) setWorking(false);
      }
    }

    void loadSavedRun();
    return () => {
      active = false;
    };
  }, [token, saved?.runId, saved?.loadId, saved?.part3Complete, saved?.part4Complete, handleApiError]);

  const tenderReceived = findStep(run, 'FREIGHTBRIDGE_RECEIVE_990')?.status === 'SUCCEEDED';
  const missingSavedState = !saved?.runId || !saved.loadId || saved.part3Complete !== true;
  const savedRunMismatch = Boolean(run && saved && run.businessIdentifier !== saved.loadId);

  const guidedStepKeys = useMemo(
    () => statusDefinitions.flatMap((definition) => [
      'CREATE_214_' + definition.status,
      'DISPATCH_214_' + definition.status,
      'FREIGHTBRIDGE_RECEIVE_214_' + definition.status,
    ]),
    [],
  );
  const completedStepCount = guidedStepKeys.filter((stepKey) => stepDone(run, stepKey)).length;
  const nextStepKey = guidedStepKeys.find((stepKey) => !stepDone(run, stepKey)) ?? null;
  const events = shipmentEvents(run);
  const currentStatus = text(run?.resultSummary.shipmentStatus);
  const allStatusesReceived = statusDefinitions.every((definition) => stepDone(run, 'FREIGHTBRIDGE_RECEIVE_214_' + definition.status));
  const checksPassed = knowledgeChecks.every((check) => answers[check.id] === check.answer);
  const canComplete = Boolean(
    run
    && tenderReceived
    && allStatusesReceived
    && currentStatus === 'DELIVERED'
    && checksPassed
    && !savedRunMismatch
  );

  async function executeNext() {
    if (!token || !run || !nextStepKey || !tenderReceived) return;
    setWorking(true);
    setError(null);
    try {
      const result = await executeLabStep(token, run.id, nextStepKey);
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The guided 214 step could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function finish() {
    if (!saved || !run || !canComplete) return;
    saveHealthyShipmentStatusProgress(saved.runId, saved.loadId);
    setComplete(true);
  }

  if (missingSavedState) {
    return (
      <RecoveryState
        title="Part 3 needs to be completed first"
        detail="This workstation continues the exact accepted tender from Part 3. Complete the 997/990 walkthrough before starting shipment-status events."
      />
    );
  }

  if (error || savedRunMismatch || (run && !tenderReceived)) {
    const detail = savedRunMismatch
      ? 'Saved load ' + saved.loadId + ' did not match the Lab run returned by the server.'
      : run && !tenderReceived
        ? 'The saved run does not show a successful FREIGHTBRIDGE_RECEIVE_990 prerequisite.'
        : error ?? 'The saved Lab run could not be resumed.';
    return <RecoveryState title="Resume the saved shipment from Part 3" detail={detail} runId={saved.runId} />;
  }

  return (
    <section className="healthy-guide healthy-status-page" data-testid="healthy-shipment-status-page">
      <Link className="secondary-button training-back-link" to="/learn"><ArrowLeft size={16} />Ops Desk</Link>

      <header className="healthy-guide-header">
        <div>
          <p className="eyebrow">Healthy Shipment Walkthrough · Part 4</p>
          <h1>Follow Midwest 214 status events all the way to Apex</h1>
          <p>Continue the same accepted load through pickup, transit, arrival, and delivery. Each event becomes X12 214, canonical FreightBridge status evidence, and an Apex-facing JSON update.</p>
        </div>
        <div className="healthy-guide-boundary">
          <span>Same shipment</span>
          <strong>{saved.loadId}</strong>
          <small>Lab run {saved.runId}</small>
        </div>
      </header>

      {working && !run && <article className="panel"><p className="muted-text">Loading the saved Lab run...</p></article>}

      {run && (
        <>
          <section className="healthy-pipeline status-pipeline" data-testid="healthy-status-pipeline">
            {statusDefinitions.map((definition, index) => {
              const received = stepDone(run, 'FREIGHTBRIDGE_RECEIVE_214_' + definition.status);
              return (
                <div className={received ? 'complete' : 'pending'} key={definition.status}>
                  {received ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  <span>{definition.label}</span>
                  {index < statusDefinitions.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
                </div>
              );
            })}
            <div className={allStatusesReceived ? 'complete' : 'pending'}>
              {allStatusesReceived ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              <span>Apex updated</span>
            </div>
          </section>

          <section className="healthy-top-grid">
            <article className="panel healthy-assignment" data-testid="healthy-status-assignment">
              <div className="healthy-message"><div className="ops-manager-avatar">M</div><div><strong>Mike</strong><small>Integration Manager</small></div></div>
              <p>“Now follow the shipment as operations would. The 990 decided whether Midwest takes the load. The 214s tell us what happens to that accepted load afterward.”</p>
              <div className="healthy-load"><span>Continue this load</span><strong>{run.businessIdentifier}</strong><small>Accepted tender · same Lab run</small></div>
            </article>

            <article className="panel status-current" data-testid="healthy-current-shipment-status">
              <p className="eyebrow">Canonical FreightBridge state</p>
              <h2>{currentStatus}</h2>
              <p>{events.length} Apex-facing shipment event{events.length === 1 ? '' : 's'} recorded in the current Lab summary.</p>
              <Link className="secondary-button" to={'/trace/' + saved.loadId}>Open Business Trace</Link>
            </article>
          </section>

          <section className="panel status-map" data-testid="healthy-214-mapping">
            <div className="panel-header">
              <div><p className="eyebrow">Partner-specific status mapping</p><h2>Midwest AT7 code → FreightBridge normalization</h2></div>
              <span className="badge badge-info">X12 004010 · 214</span>
            </div>
            <div className="status-mapping-grid">
              {statusDefinitions.map((definition) => (
                <article key={definition.status}>
                  <span className="badge badge-info">AT7-01 {definition.at7}</span>
                  <h3>{definition.status}</h3>
                  <p>{definition.meaning}</p>
                  <small><MapPin size={14} />{definition.location}</small>
                </article>
              ))}
            </div>
            <p className="muted-text">The X12-facing codes keep their Midwest meanings. FreightBridge translates only this agreed partner subset into its internal shipment-status names.</p>
          </section>

          <section className="panel status-timeline" data-testid="healthy-214-timeline">
            <div className="panel-header">
              <div><p className="eyebrow">Real Lab actions</p><h2>Create → SFTP → FreightBridge for each status</h2></div>
              <span className="badge badge-info">{completedStepCount} / {guidedStepKeys.length} complete</span>
            </div>

            <div className="status-event-list">
              {statusDefinitions.map((definition) => {
                const createKey = 'CREATE_214_' + definition.status;
                const dispatchKey = 'DISPATCH_214_' + definition.status;
                const receiveKey = 'FREIGHTBRIDGE_RECEIVE_214_' + definition.status;
                const created = stepDone(run, createKey);
                const dispatched = stepDone(run, dispatchKey);
                const received = stepDone(run, receiveKey);
                const event = eventForStatus(events, definition.status);

                return (
                  <article className={'status-event-card ' + (received ? 'complete' : '')} key={definition.status} data-testid={'healthy-status-' + definition.status}>
                    <div className="status-event-heading">
                      <div>
                        <span className="badge badge-info">{definition.at7}</span>
                        <h3>{definition.label}</h3>
                        <p>{definition.meaning}</p>
                      </div>
                      {received ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </div>

                    <div className="status-hop-row">
                      <StatusHop label="Midwest event" done={created} />
                      <ArrowRight size={14} aria-hidden="true" />
                      <StatusHop label="214 on SFTP" done={dispatched} />
                      <ArrowRight size={14} aria-hidden="true" />
                      <StatusHop label="FreightBridge + Apex" done={received} />
                    </div>

                    {event && (
                      <div className="healthy-fields">
                        <div><span>Status</span><strong>{text(event.status)}</strong></div>
                        <div><span>Occurred at</span><strong>{text(event.occurredAt)}</strong></div>
                        <div><span>Received at</span><strong>{text(event.receivedAt)}</strong></div>
                        <div><span>Location</span><strong>{eventLocation(event)}</strong></div>
                      </div>
                    )}

                    {nextStepKey && [createKey, dispatchKey, receiveKey].includes(nextStepKey) && (
                      <button className="primary-button" type="button" onClick={executeNext} disabled={working}>
                        {nextStepKey === createKey ? <Clock3 size={16} /> : nextStepKey === dispatchKey ? <Send size={16} /> : <Inbox size={16} />}
                        {nextStepKey === createKey
                          ? 'Create ' + definition.label + ' Event'
                          : nextStepKey === dispatchKey
                            ? 'Send ' + definition.label + ' 214'
                            : 'Receive ' + definition.label + ' 214'}
                      </button>
                    )}

                    {(created || dispatched || received) && (
                      <details className="response-step-evidence">
                        <summary>Inspect safe technical evidence</summary>
                        <StepEvidence step={findLatestCompletedStep(run, [receiveKey, dispatchKey, createKey])} />
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel event-time-lesson" data-testid="healthy-event-time-lesson">
            <div className="panel-header"><div><p className="eyebrow">Operations lesson</p><h2>Occurred time is not received time</h2></div></div>
            <p>A 214 describes when the business event happened. FreightBridge also records when it received the message. Keeping both lets the platform preserve event history and avoid treating network arrival order as the shipment’s business chronology.</p>
          </section>

          <section className="panel healthy-checks" data-testid="healthy-status-checks">
            <div className="panel-header"><div><p className="eyebrow">Knowledge checks</p><h2>Confirm the shipment-status boundary</h2></div><span className="badge badge-info">{checksPassed ? 'Ready' : 'In progress'}</span></div>
            <div className="mapping-check-grid">
              {knowledgeChecks.map((check) => (
                <fieldset className="knowledge-check" key={check.id}>
                  <legend>{check.prompt}</legend>
                  <div className="knowledge-options">
                    {check.options.map((option) => (
                      <button
                        className={answers[check.id] === option ? 'selected' : ''}
                        key={option}
                        type="button"
                        onClick={() => setAnswers((current) => ({ ...current, [check.id]: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {answers[check.id] && (
                    <div className={'knowledge-feedback ' + (answers[check.id] === check.answer ? 'correct' : 'incorrect')}>
                      {answers[check.id] === check.answer ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                      <p>{answers[check.id] === check.answer ? 'Correct.' : 'Not quite. Recheck the 214 mapping and event-time lesson.'}</p>
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
          </section>

          <article className={'panel healthy-finish ' + (complete ? 'complete' : '')} data-testid="healthy-part4-completion">
            <div>
              <p className="eyebrow">Part 4 completion</p>
              <h2>Shipment delivered and Apex-facing status history verified</h2>
              <p>This completes the guided healthy shipment flow. The 210 freight invoice remains future/stretch work and is not executed or presented as implemented here.</p>
            </div>
            {!complete ? (
              <button className="primary-button" type="button" onClick={finish} disabled={!canComplete}>
                <CheckCircle2 size={16} />Complete Part 4
              </button>
            ) : (
              <div className="healthy-next"><CheckCircle2 size={18} /><span><strong>Part 4 complete.</strong><small>Same run {saved.runId}; final status {currentStatus}.</small></span></div>
            )}
          </article>
        </>
      )}
    </section>
  );
}

function StatusHop({ label, done }: { label: string; done: boolean }) {
  return <span className={done ? 'complete' : ''}>{done ? <CheckCircle2 size={14} /> : <Circle size={14} />}{label}</span>;
}

function StepEvidence({ step }: { step: LabStep | null }) {
  if (!step) return <p className="muted-text">Evidence pending.</p>;
  const response = asRecord(step.responseSummary) ?? {};
  const targetProcessed = asRecord(response.targetProcessed);
  const fileName = response.fileName ?? response.targetFileName ?? targetProcessed?.fileName;
  return (
    <div className="status-step-evidence">
      <div className="healthy-fields">
        <div><span>Step</span><strong>{step.stepKey}</strong></div>
        <div><span>Transport</span><strong>{step.transport}</strong></div>
        <div><span>Document</span><strong>{step.documentType}</strong></div>
        <div><span>File</span><strong>{text(fileName)}</strong></div>
      </div>
      <pre className="healthy-raw">{rawEvidence(step.responseSummary)}</pre>
    </div>
  );
}

function RecoveryState({ title, detail, runId }: { title: string; detail: string; runId?: string }) {
  return (
    <section className="healthy-guide" data-testid="healthy-status-recovery">
      <Link className="secondary-button training-back-link" to="/learn"><ArrowLeft size={16} />Ops Desk</Link>
      <article className="panel training-alert" role="alert">
        <AlertTriangle size={20} />
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
          {runId && <p className="muted-text">Saved Lab run: {runId}</p>}
          <Link className="primary-button" to="/learn/healthy/acknowledgments">Return to Part 3</Link>
        </div>
      </article>
    </section>
  );
}

function stepDone(run: LabRun | null, stepKey: string): boolean {
  return findStep(run, stepKey)?.status === 'SUCCEEDED';
}

function findLatestCompletedStep(run: LabRun | null, keys: string[]): LabStep | null {
  for (const key of keys) {
    const step = findStep(run, key);
    if (step?.status === 'SUCCEEDED') return step;
  }
  return null;
}

function eventForStatus(events: Record<string, unknown>[], status: string): Record<string, unknown> | null {
  return events.find((event) => event.status === status) ?? null;
}

function eventLocation(event: Record<string, unknown>): string {
  const city = text(event.city);
  const state = text(event.state);
  if (city === 'Pending' && state === 'Pending') return 'Pending';
  return [city === 'Pending' ? '' : city, state === 'Pending' ? '' : state].filter(Boolean).join(', ');
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Pending';
  return String(value);
}

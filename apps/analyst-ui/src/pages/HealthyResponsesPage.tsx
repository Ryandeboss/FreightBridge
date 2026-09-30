import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCheck2,
  Inbox,
  Send,
  Server,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { executeLabStep, fetchLabRun, type LabRun, type LabStep } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  loadHealthyWalkthroughState,
  saveHealthy997990Progress,
} from '../training/healthyWalkthrough';
import { asRecord, find204Preview, findStep, rawEvidence } from '../training/labEvidence';

type GuidedStep = {
  key:
    | 'MIDWEST_RECEIVE_204'
    | 'DISPATCH_997_SFTP'
    | 'FREIGHTBRIDGE_RECEIVE_997'
    | 'CREATE_TENDER_DECISION'
    | 'DISPATCH_990_SFTP'
    | 'FREIGHTBRIDGE_RECEIVE_990';
  eyebrow: string;
  title: string;
  description: string;
  action: string;
};

const guidedSteps: GuidedStep[] = [
  {
    key: 'MIDWEST_RECEIVE_204',
    eyebrow: 'Partner processing',
    title: 'Midwest processes the inbound 204',
    description: 'Midwest reads the 204 from inbound SFTP, validates the EDI structure, archives the file, and creates a 997 functional acknowledgment document.',
    action: 'Have Midwest Process 204',
  },
  {
    key: 'DISPATCH_997_SFTP',
    eyebrow: 'Technical acknowledgment',
    title: 'Midwest sends the 997',
    description: 'The 997 travels from Midwest outbound SFTP toward FreightBridge. It reports technical/functional acknowledgment of the 204, not a freight tender decision.',
    action: 'Send 997 to FreightBridge',
  },
  {
    key: 'FREIGHTBRIDGE_RECEIVE_997',
    eyebrow: 'FreightBridge evidence',
    title: 'FreightBridge receives and correlates the 997',
    description: 'FreightBridge parses the 997 and correlates AK1/AK2 control numbers to the original outbound 204. The load can be technically acknowledged while the tender is still pending.',
    action: 'Receive 997 in FreightBridge',
  },
  {
    key: 'CREATE_TENDER_DECISION',
    eyebrow: 'Business decision',
    title: 'Midwest accepts the tender',
    description: 'For this healthy Lab scenario, the analyst triggers the Midwest simulator to record the carrier business decision. Midwest then has a 990 tender-response document ready to send.',
    action: 'Record Midwest Acceptance',
  },
  {
    key: 'DISPATCH_990_SFTP',
    eyebrow: 'Business response',
    title: 'Midwest sends the 990',
    description: 'The 990 is the business answer to the 204. Unlike the 997, this message says whether Midwest accepted or rejected the freight tender.',
    action: 'Send 990 to FreightBridge',
  },
  {
    key: 'FREIGHTBRIDGE_RECEIVE_990',
    eyebrow: 'Business outcome',
    title: 'FreightBridge receives the 990',
    description: 'FreightBridge maps the Midwest 990 into the canonical tender response and forwards that decision to Apex. This healthy walkthrough expects ACCEPTED.',
    action: 'Receive 990 in FreightBridge',
  },
];

const knowledgeChecks = [
  {
    id: '997-purpose',
    prompt: 'What does the 997 prove in this workflow?',
    options: [
      'Midwest technically acknowledged the 204',
      'Midwest accepted the freight tender',
      'The shipment was delivered',
    ],
    answer: 'Midwest technically acknowledged the 204',
  },
  {
    id: 'pending-after-997',
    prompt: 'After an accepted 997, can the freight tender still be pending?',
    options: ['Yes', 'No'],
    answer: 'Yes',
  },
  {
    id: '990-purpose',
    prompt: 'Which message carries Midwest’s business tender decision?',
    options: ['990', '997', '214'],
    answer: '990',
  },
] as const;

export function HealthyResponsesPage() {
  const { token, handleApiError } = useOperationsSession();
  const saved = loadHealthyWalkthroughState();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(saved?.part3Complete === true);

  useEffect(() => {
    let active = true;

    async function loadSavedRun() {
      if (!token || !saved?.runId || !saved.loadId || saved.part2Complete !== true) return;
      setWorking(true);
      setError(null);
      try {
        const fetched = await fetchLabRun(token, saved.runId);
        if (!active) return;
        setRun(fetched);
        setComplete(saved.part3Complete === true);
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
  }, [token, saved?.runId, saved?.loadId, saved?.part2Complete, saved?.part3Complete, handleApiError]);

  const dispatch204 = findStep(run, 'DISPATCH_204_SFTP');
  const first214 = findStep(run, 'CREATE_214_PICKED_UP');
  const preview204 = useMemo(() => find204Preview(run), [run]);
  const savedRunMismatch = Boolean(run && saved && run.businessIdentifier !== saved.loadId);
  const missingSavedState = !saved?.runId || !saved.loadId || saved.part1Complete !== true || saved.part2Complete !== true;
  const part2Ready = dispatch204?.status === 'SUCCEEDED';
  const beyondPart3 = first214?.status === 'SUCCEEDED';

  const completedStepCount = guidedSteps.filter((item) => findStep(run, item.key)?.status === 'SUCCEEDED').length;
  const nextStep = guidedSteps.find((item) => findStep(run, item.key)?.status !== 'SUCCEEDED') ?? null;
  const allStepsComplete = completedStepCount === guidedSteps.length;

  const technicalAcknowledgment = text(run?.resultSummary.technicalAcknowledgment);
  const tenderStatus = text(run?.resultSummary.tenderStatus);
  const ackDetail = asRecord(run?.resultSummary.technicalAcknowledgmentDetail);
  const checksPassed = knowledgeChecks.every((check) => answers[check.id] === check.answer);
  const canComplete = Boolean(
    run
    && allStepsComplete
    && technicalAcknowledgment === 'ACCEPTED'
    && tenderStatus === 'ACCEPTED'
    && checksPassed
    && !savedRunMismatch
    && !beyondPart3
  );

  async function executeNext() {
    if (!token || !run || !nextStep || !part2Ready || beyondPart3) return;
    setWorking(true);
    setError(null);
    try {
      const result = await executeLabStep(token, run.id, nextStep.key);
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The guided response step could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function finish() {
    if (!saved || !run || !canComplete) return;
    saveHealthy997990Progress(saved.runId, saved.loadId);
    setComplete(true);
  }

  if (missingSavedState) {
    return (
      <RecoveryState
        title="Part 2 needs to be completed first"
        detail="This workstation continues the exact shipment whose Midwest 204 was generated and placed on inbound SFTP. Complete Part 2 before processing that file."
      />
    );
  }

  if (error || savedRunMismatch || beyondPart3 || (run && !part2Ready)) {
    const detail = savedRunMismatch
      ? `Saved load ${saved.loadId} did not match the Lab run returned by the server.`
      : beyondPart3
        ? 'This Lab run has already progressed into 214 shipment-status activity. Use a clean healthy-flow run to study the 997/990 boundary.'
        : run && !part2Ready
          ? 'The saved run does not show a successful DISPATCH_204_SFTP prerequisite.'
          : error ?? 'The saved Lab run could not be resumed.';
    return <RecoveryState title="Resume the saved shipment from Part 2" detail={detail} runId={saved.runId} />;
  }

  return (
    <section className="healthy-guide healthy-response-page" data-testid="healthy-responses-page">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Ops Desk</Link>

      <header className="healthy-guide-header">
        <div>
          <p className="eyebrow">Healthy Shipment Walkthrough · Part 3</p>
          <h1>Separate technical acknowledgment from business acceptance</h1>
          <p>Continue the same shipment from Midwest inbound SFTP through the 997 technical acknowledgment and the 990 business tender response.</p>
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
          <section className="healthy-pipeline response-pipeline" data-testid="healthy-response-pipeline">
            {([
              ['204 on inbound SFTP', true],
              ['Midwest processed 204', stepDone(run, 'MIDWEST_RECEIVE_204')],
              ['997 received by FreightBridge', stepDone(run, 'FREIGHTBRIDGE_RECEIVE_997')],
              ['Midwest tender decision', stepDone(run, 'CREATE_TENDER_DECISION')],
              ['990 received by FreightBridge', stepDone(run, 'FREIGHTBRIDGE_RECEIVE_990')],
              ['214 shipment statuses', false],
            ] as const).map(([label, done], index, items) => (
              <div className={done ? 'complete' : index === items.length - 1 ? 'not-yet' : 'pending'} key={label}>
                {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                <span>{label}</span>
                {index < items.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
              </div>
            ))}
          </section>

          <section className="healthy-top-grid">
            <article className="panel healthy-assignment" data-testid="healthy-response-assignment">
              <div className="healthy-message"><div className="ops-manager-avatar">M</div><div><strong>Mike</strong><small>Integration Manager</small></div></div>
              <p>“This is the distinction support has to get right: a 997 says the EDI was technically acknowledged. A 990 says what Midwest decided about the load.”</p>
              <div className="healthy-load"><span>Continue this load</span><strong>{run.businessIdentifier}</strong><small>Do not create a replacement run</small></div>
            </article>

            <article className="panel ack-compare" data-testid="997-990-comparison">
              <div><span className="badge badge-info">997</span><strong>Technical / functional acknowledgment</strong><small>Did Midwest receive and evaluate the 204 structure?</small></div>
              <div><span className="badge badge-success">990</span><strong>Business tender response</strong><small>Did Midwest accept or reject the freight tender?</small></div>
            </article>
          </section>

          <section className="panel response-timeline" data-testid="healthy-response-timeline">
            <div className="panel-header">
              <div><p className="eyebrow">One real Lab run</p><h2>Move the shipment through the acknowledgment boundary</h2></div>
              <span className="badge badge-info">{completedStepCount} / {guidedSteps.length} complete</span>
            </div>

            <div className="response-step-list">
              {guidedSteps.map((item, index) => {
                const labStep = findStep(run, item.key);
                const done = labStep?.status === 'SUCCEEDED';
                const current = nextStep?.key === item.key;
                return (
                  <article className={`response-step ${done ? 'complete' : current ? 'current' : ''}`} key={item.key} data-testid={`healthy-response-step-${item.key}`}>
                    <div className="healthy-step-number">{done ? <CheckCircle2 size={17} /> : index + 1}</div>
                    <div>
                      <p className="eyebrow">{item.eyebrow}</p>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      {done && labStep && <StepEvidence step={labStep} />}
                      {current && (
                        <button className="primary-button" type="button" onClick={executeNext} disabled={working}>
                          {item.key.includes('DISPATCH') ? <Send size={16} /> : item.key.includes('RECEIVE') ? <Inbox size={16} /> : <FileCheck2 size={16} />}
                          {item.action}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {stepDone(run, 'FREIGHTBRIDGE_RECEIVE_997') && (
            <section className="panel response-evidence" data-testid="healthy-997-evidence">
              <div className="panel-header"><div><p className="eyebrow">997 evidence</p><h2>Technical acknowledgment received</h2></div><span className="badge badge-success">{technicalAcknowledgment}</span></div>
              <div className="healthy-fields">
                <div><span>AK5 transaction acknowledgment</span><strong>{text(ackDetail?.ak5)}</strong></div>
                <div><span>AK9 group acknowledgment</span><strong>{text(ackDetail?.ak9)}</strong></div>
                <div><span>Acknowledged 204 GS06</span><strong>{text(ackDetail?.acknowledgedGroupControlNumber ?? preview204?.groupControlNumber)}</strong></div>
                <div><span>Acknowledged 204 ST02</span><strong>{text(ackDetail?.acknowledgedTransactionControlNumber ?? preview204?.transactionControlNumber)}</strong></div>
                <div><span>Tender status after 997</span><strong>{stepDone(run, 'FREIGHTBRIDGE_RECEIVE_990') ? tenderStatus : 'PENDING'}</strong></div>
              </div>
              <p className="muted-text">The accepted 997 proves technical acknowledgment of the 204. It does not create the carrier’s business tender decision.</p>
            </section>
          )}

          {stepDone(run, 'FREIGHTBRIDGE_RECEIVE_990') && (
            <section className="panel response-evidence" data-testid="healthy-990-evidence">
              <div className="panel-header"><div><p className="eyebrow">990 evidence</p><h2>Business tender response received</h2></div><span className="badge badge-success">{tenderStatus}</span></div>
              <div className="healthy-tech">
                <div><Server size={18} /><span><strong>Midwest → FreightBridge</strong><small>990 over outbound SFTP</small></span></div>
                <div><CheckCircle2 size={18} /><span><strong>Canonical tender outcome</strong><small>{tenderStatus}</small></span></div>
                <div><ArrowRight size={18} /><span><strong>Apex-facing outcome</strong><small>FreightBridge’s 990 ingestion flow forwards the tender decision to Apex.</small></span></div>
              </div>
              <p className="muted-text">Part 3 stops here. No 214 pickup/in-transit/arrival/delivery event has been executed by this walkthrough.</p>
            </section>
          )}

          <section className="panel healthy-checks" data-testid="healthy-response-checks">
            <div className="panel-header"><div><p className="eyebrow">Knowledge checks</p><h2>997 is not 990</h2></div><span className="badge badge-info">{checksPassed ? 'Ready' : 'In progress'}</span></div>
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
                    <div className={`knowledge-feedback ${answers[check.id] === check.answer ? 'correct' : 'incorrect'}`}>
                      {answers[check.id] === check.answer ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                      <p>{answers[check.id] === check.answer ? 'Correct.' : 'Not quite. Keep the technical 997 separate from the business 990.'}</p>
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
          </section>

          <article className={`panel healthy-finish ${complete ? 'complete' : ''}`} data-testid="healthy-part3-completion">
            <div>
              <p className="eyebrow">Part 3 completion</p>
              <h2>997 acknowledged, 990 accepted, 214 not started</h2>
              <p>Complete Part 3 only after FreightBridge has real 997 and 990 outcomes on this saved Lab run and the distinction is clear.</p>
            </div>
            {!complete ? (
              <button className="primary-button" type="button" onClick={finish} disabled={!canComplete}>
                <CheckCircle2 size={16} />Complete Part 3
              </button>
            ) : (
              <div className="healthy-next">
                <CheckCircle2 size={18} />
                <span><strong>Part 3 complete.</strong><small>Saved run {saved.runId}; load {saved.loadId} is ready for the 214 status walkthrough.</small></span>
                <Link className="primary-button" to="/learn/healthy/shipment-status">Continue to Part 4<ArrowRight size={16} /></Link>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}

function StepEvidence({ step }: { step: LabStep }) {
  const response = asRecord(step.responseSummary) ?? {};
  const targetProcessed = asRecord(response.targetProcessed);
  const fileName = response.fileName ?? response.targetFileName ?? targetProcessed?.fileName;
  const transport = response.transport ?? step.transport;
  return (
    <details className="response-step-evidence">
      <summary>Inspect safe technical evidence</summary>
      <div className="healthy-fields">
        <div><span>Step key</span><strong>{step.stepKey}</strong></div>
        <div><span>Transport</span><strong>{text(transport)}</strong></div>
        <div><span>Document</span><strong>{step.documentType}</strong></div>
        <div><span>File</span><strong>{text(fileName)}</strong></div>
      </div>
      <pre className="healthy-raw">{rawEvidence(step.responseSummary)}</pre>
    </details>
  );
}

function RecoveryState({ title, detail, runId }: { title: string; detail: string; runId?: string }) {
  return (
    <section className="healthy-guide" data-testid="healthy-response-recovery">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Ops Desk</Link>
      <article className="panel training-alert" role="alert">
        <AlertTriangle size={20} />
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
          {runId && <p className="muted-text">Saved Lab run: {runId}</p>}
          <Link className="primary-button" to="/learn/healthy/mapping-204">Return to Part 2</Link>
        </div>
      </article>
    </section>
  );
}

function stepDone(run: LabRun | null, stepKey: string): boolean {
  return findStep(run, stepKey)?.status === 'SUCCEEDED';
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Pending';
  return String(value);
}

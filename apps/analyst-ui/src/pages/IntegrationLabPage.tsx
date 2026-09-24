import { FastForward, Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  createLabRun,
  executeLabStep,
  fetchLabReadiness,
  fetchLabRun,
  fetchLabRuns,
  runNextLabStep,
  type LabReadiness,
  type LabRun,
  type LabRunCreateRequest,
  type LabScenario,
  type LabStep,
} from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { PageTitle } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/dates';

const lanes = ['Apex Logistics', 'FreightBridge', 'Midwest Carrier'];

const scenarioMeta: Record<string, { title: string; path: string; endState: string }> = {
  TECHNICAL_ACK_ONLY: {
    title: 'Technical Acknowledgment',
    path: 'Apex JSON -> FreightBridge -> Midwest 204 -> Midwest 997',
    endState: '204 acknowledged, tender still pending',
  },
  TENDER_ACCEPTED: {
    title: 'Tender Accepted',
    path: '204 + 997 + accepted 990',
    endState: 'Tender accepted',
  },
  TENDER_REJECTED: {
    title: 'Tender Rejected',
    path: '204 + 997 + rejected 990',
    endState: 'Tender rejected',
  },
  FULL_SHIPMENT_LIFECYCLE: {
    title: 'Full Shipment Lifecycle',
    path: '204 + 997 + 990 + four 214 updates',
    endState: 'Delivered',
  },
};

type LabFormState = {
  scenarioKey: string;
  loadId: string;
  bolNumber: string;
  purchaseOrderNumber: string;
  customerReference: string;
  equipmentType: 'VAN_53' | 'REEFER_53' | 'FLATBED';
  weightLbs: string;
  pieces: string;
  commodityDescription: string;
  pickupFacilityName: string;
  pickupAddress1: string;
  pickupAddress2: string;
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  pickupScheduledDateTime: string;
  deliveryFacilityName: string;
  deliveryAddress1: string;
  deliveryAddress2: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  deliveryScheduledDateTime: string;
  rejectionReasonCode: string;
  rejectionMessage: string;
};

const defaultForm: LabFormState = {
  scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
  loadId: '',
  bolNumber: '',
  purchaseOrderNumber: '',
  customerReference: '',
  equipmentType: 'VAN_53',
  weightLbs: '42000',
  pieces: '22',
  commodityDescription: 'Industrial Components',
  pickupFacilityName: 'ABC Factory',
  pickupAddress1: '200 Industrial Rd',
  pickupAddress2: '',
  pickupCity: 'Aurora',
  pickupState: 'IL',
  pickupPostalCode: '60505',
  pickupScheduledDateTime: '',
  deliveryFacilityName: 'XYZ Warehouse',
  deliveryAddress1: '900 Commerce St',
  deliveryAddress2: '',
  deliveryCity: 'Detroit',
  deliveryState: 'MI',
  deliveryPostalCode: '48201',
  deliveryScheduledDateTime: '',
  rejectionReasonCode: 'CAPACITY',
  rejectionMessage: 'Synthetic carrier rejection.',
};

export function IntegrationLabPage() {
  const { token, handleApiError } = useOperationsSession();
  const { runId } = useParams();
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<LabReadiness | null>(null);
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<LabRun | null>(null);
  const [form, setForm] = useState<LabFormState>(defaultForm);
  const [scenarioKind, setScenarioKind] = useState<'HAPPY_PATH' | 'FAILURE_DRILL'>('HAPPY_PATH');
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopAfterCurrent = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [nextReadiness, nextRuns, detailRun] = await Promise.all([
        fetchLabReadiness(token),
        fetchLabRuns(token, { limit: 12, offset: 0 }),
        runId ? fetchLabRun(token, runId) : Promise.resolve(null),
      ]);
      setReadiness(nextReadiness);
      setRuns(nextRuns.runs);
      setSelectedRun(detailRun);
      if (!nextReadiness.scenarios.some((scenario) => scenario.scenarioKey === form.scenarioKey)) {
        setForm((current) => ({ ...current, scenarioKey: nextReadiness.scenarios[0]?.scenarioKey ?? 'FULL_SHIPMENT_LIFECYCLE' }));
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Integration Lab could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [form.scenarioKey, handleApiError, runId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRun() {
    if (!token || readiness?.status !== 'ready') return;
    setIsWorking(true);
    setError(null);
    try {
      const run = await createLabRun(token, toCreateRequest(form));
      setSelectedRun(run);
      const nextRuns = await fetchLabRuns(token, { limit: 12, offset: 0 });
      setRuns(nextRuns.runs);
      navigate(`/lab/runs/${run.id}`);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Run could not be created.');
    } finally {
      setIsWorking(false);
    }
  }

  async function runStep(step: LabStep) {
    if (!token || !selectedRun) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await executeLabStep(token, selectedRun.id, step.stepKey);
      setSelectedRun(result.run);
      const nextRuns = await fetchLabRuns(token, { limit: 12, offset: 0 });
      setRuns(nextRuns.runs);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Step execution failed.');
    } finally {
      setIsWorking(false);
    }
  }

  async function runNext() {
    if (!token || !selectedRun) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await runNextLabStep(token, selectedRun.id);
      setSelectedRun(result.run);
      const nextRuns = await fetchLabRuns(token, { limit: 12, offset: 0 });
      setRuns(nextRuns.runs);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Next step failed.');
    } finally {
      setIsWorking(false);
    }
  }

  async function runAll() {
    if (!token || !selectedRun) return;
    stopAfterCurrent.current = false;
    setIsWorking(true);
    setError(null);
    let currentRun = selectedRun;
    try {
      for (let index = 0; index < currentRun.steps.length; index += 1) {
        if (stopAfterCurrent.current || currentRun.status === 'SUCCEEDED') break;
        const result = await runNextLabStep(token, currentRun.id);
        currentRun = result.run;
        setSelectedRun(result.run);
        if (!result.step) break;
      }
      const nextRuns = await fetchLabRuns(token, { limit: 12, offset: 0 });
      setRuns(nextRuns.runs);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Run all stopped on a failed step.');
    } finally {
      setIsWorking(false);
      stopAfterCurrent.current = false;
    }
  }

  return (
    <section className="page-stack" data-testid="integration-lab-page">
      <PageTitle eyebrow="Integration Lab" title="Scenario Workbench">
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading Integration Lab" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {readiness && !isLoading && (
        <>
          <section className="content-grid two-column">
            <article className="panel">
              <div className="panel-header">
                <h2>Readiness</h2>
                <StatusBadge value={readiness.status} />
              </div>
              <ReadinessPanel readiness={readiness} />
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Recent Runs</h2>
              </div>
              {!runs.length ? (
                <EmptyBlock title="No lab runs yet" />
              ) : (
                <div className="compact-list">
                  {runs.map((run) => (
                    <Link key={run.id} className={`compact-row lab-run-row ${selectedRun?.id === run.id ? 'active' : ''}`} to={`/lab/runs/${run.id}`}>
                      <div>
                        <strong>{run.businessIdentifier}</strong>
                        <span>{run.scenarioKey}</span>
                      </div>
                      <StatusBadge value={run.status} />
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>New Run</h2>
              <span>Synthetic Integration Test</span>
            </div>
            <div className="segmented-control" aria-label="Integration Lab scenario type">
              <button
                className={scenarioKind === 'HAPPY_PATH' ? 'active' : ''}
                type="button"
                onClick={() => {
                  const scenario = readiness.scenarios.find((candidate) => (candidate.kind ?? 'HAPPY_PATH') === 'HAPPY_PATH');
                  setScenarioKind('HAPPY_PATH');
                  if (scenario) setForm((current) => ({ ...current, scenarioKey: scenario.scenarioKey }));
                }}
              >
                Happy Paths
              </button>
              <button
                className={scenarioKind === 'FAILURE_DRILL' ? 'active' : ''}
                type="button"
                onClick={() => {
                  const scenario = readiness.scenarios.find((candidate) => candidate.kind === 'FAILURE_DRILL');
                  setScenarioKind('FAILURE_DRILL');
                  if (scenario) setForm((current) => ({ ...current, scenarioKey: scenario.scenarioKey }));
                }}
              >
                Failure Drills
              </button>
            </div>
            <ScenarioCards
              scenarios={readiness.scenarios.filter((scenario) => (scenario.kind ?? 'HAPPY_PATH') === scenarioKind)}
              selected={form.scenarioKey}
              onSelect={(scenarioKey) => setForm((current) => ({ ...current, scenarioKey }))}
            />
            <LabRunForm
              form={form}
              readiness={readiness}
              selectedScenario={readiness.scenarios.find((scenario) => scenario.scenarioKey === form.scenarioKey) ?? null}
              isWorking={isWorking}
              onChange={setForm}
              onCreate={createRun}
            />
          </section>

          {selectedRun ? (
            <RunDetail
              run={selectedRun}
              isWorking={isWorking}
              onRunStep={runStep}
              onRunNext={runNext}
              onRunAll={runAll}
              onStop={() => {
                stopAfterCurrent.current = true;
              }}
            />
          ) : (
            <article className="panel">
              <EmptyBlock title="Select a run to inspect" />
            </article>
          )}
        </>
      )}
    </section>
  );
}

function ReadinessPanel({ readiness }: { readiness: LabReadiness }) {
  const dependencies = asRecord(readiness.dependencies) ?? {};
  const items = [
    ['FreightBridge', asRecord(dependencies.freightBridge)],
    ['Apex Simulator', asRecord(dependencies.apexSimulator)],
    ['Midwest Simulator', asRecord(dependencies.midwestSimulator)],
    ['Midwest SFTP', asRecord(dependencies.midwestSftp)],
  ] as const;

  return (
    <>
      <dl className="definition-grid">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><StatusBadge value={value?.status === 'ready' ? 'Ready' : 'Not Ready'} /></dd>
          </div>
        ))}
      </dl>
      {readiness.status !== 'ready' && <p className="muted-text">Create Run is disabled until every dependency is Ready.</p>}
    </>
  );
}

function ScenarioCards({
  scenarios,
  selected,
  onSelect,
}: {
  scenarios: LabScenario[];
  selected: string;
  onSelect: (scenarioKey: string) => void;
}) {
  return (
    <div className="content-grid two-column">
      {scenarios.map((scenario) => {
        const meta = scenarioMeta[scenario.scenarioKey] ?? {
          title: scenario.name,
          path: scenario.kind === 'FAILURE_DRILL'
            ? `${String(scenario.layer ?? 'Failure drill')} / ${String(scenario.expectedFailure?.errorCode ?? 'Expected failure')}`
            : scenario.scenarioKey,
          endState: scenario.kind === 'FAILURE_DRILL' ? 'Expected failure observed' : 'Scenario complete',
        };
        return (
          <button
            className={`compact-row lab-run-row ${selected === scenario.scenarioKey ? 'active' : ''}`}
            key={scenario.scenarioKey}
            type="button"
            onClick={() => onSelect(scenario.scenarioKey)}
          >
            <div>
              <strong>{meta.title}</strong>
              <span>{scenario.description}</span>
              <span>{meta.path}</span>
              {scenario.expectedFailure && (
                <span>
                  {String(scenario.expectedFailure.category ?? '')} / {String(scenario.expectedFailure.stage ?? '')}
                </span>
              )}
              <small>{scenario.stepCount} steps / {meta.endState}</small>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LabRunForm({
  form,
  readiness,
  selectedScenario,
  isWorking,
  onChange,
  onCreate,
}: {
  form: LabFormState;
  readiness: LabReadiness;
  selectedScenario: LabScenario | null;
  isWorking: boolean;
  onChange: (form: LabFormState) => void;
  onCreate: () => void;
}) {
  const setField = (field: keyof LabFormState, value: string) => onChange({ ...form, [field]: value });
  const createDisabled = isWorking || readiness.status !== 'ready';
  const isFailureDrill = selectedScenario?.kind === 'FAILURE_DRILL';

  return (
    <div className="editor-stack">
      <label>
        Scenario
        <select
  data-testid="lab-scenario-select"
  value={form.scenarioKey}
  onChange={(event) => setField('scenarioKey', event.target.value)}
>
          {readiness.scenarios
            .filter((scenario) => (scenario.kind ?? 'HAPPY_PATH') === (isFailureDrill ? 'FAILURE_DRILL' : 'HAPPY_PATH'))
            .map((scenario) => (
            <option key={scenario.scenarioKey} value={scenario.scenarioKey}>{scenario.name}</option>
          ))}
        </select>
      </label>

      {isFailureDrill && selectedScenario ? (
        <FailureDrillSetup scenario={selectedScenario} form={form} onChange={setField} />
      ) : (
      <section className="content-grid two-column">
        <div className="editor-stack">
          <h3>General</h3>
          <label>Load ID<input value={form.loadId} onChange={(event) => setField('loadId', event.target.value)} placeholder="Auto-generate" /></label>
          <label>BOL<input value={form.bolNumber} onChange={(event) => setField('bolNumber', event.target.value)} placeholder="Auto-generate" /></label>
          <label>PO<input value={form.purchaseOrderNumber} onChange={(event) => setField('purchaseOrderNumber', event.target.value)} placeholder="Auto-generate" /></label>
          <label>Customer Reference<input value={form.customerReference} onChange={(event) => setField('customerReference', event.target.value)} placeholder="Auto-generate" /></label>
          <label>
            Equipment
            <select value={form.equipmentType} onChange={(event) => setField('equipmentType', event.target.value)}>
              <option value="VAN_53">VAN_53</option>
              <option value="REEFER_53">REEFER_53</option>
              <option value="FLATBED">FLATBED</option>
            </select>
          </label>
          <label>Weight<input type="number" value={form.weightLbs} onChange={(event) => setField('weightLbs', event.target.value)} /></label>
          <label>Pieces<input type="number" value={form.pieces} onChange={(event) => setField('pieces', event.target.value)} /></label>
          <label>Commodity<input value={form.commodityDescription} onChange={(event) => setField('commodityDescription', event.target.value)} /></label>
        </div>

        <div className="editor-stack">
          <h3>Pickup</h3>
          <label>Facility Name<input value={form.pickupFacilityName} onChange={(event) => setField('pickupFacilityName', event.target.value)} /></label>
          <label>Address 1<input value={form.pickupAddress1} onChange={(event) => setField('pickupAddress1', event.target.value)} /></label>
          <label>Address 2<input value={form.pickupAddress2} onChange={(event) => setField('pickupAddress2', event.target.value)} /></label>
          <label>City<input value={form.pickupCity} onChange={(event) => setField('pickupCity', event.target.value)} /></label>
          <label>State<input value={form.pickupState} onChange={(event) => setField('pickupState', event.target.value.toUpperCase())} maxLength={2} /></label>
          <label>Postal Code<input value={form.pickupPostalCode} onChange={(event) => setField('pickupPostalCode', event.target.value)} /></label>
          <label>Scheduled Date/Time<input type="datetime-local" value={form.pickupScheduledDateTime} onChange={(event) => setField('pickupScheduledDateTime', event.target.value)} /></label>
        </div>

        <div className="editor-stack">
          <h3>Delivery</h3>
          <label>Facility Name<input value={form.deliveryFacilityName} onChange={(event) => setField('deliveryFacilityName', event.target.value)} /></label>
          <label>Address 1<input value={form.deliveryAddress1} onChange={(event) => setField('deliveryAddress1', event.target.value)} /></label>
          <label>Address 2<input value={form.deliveryAddress2} onChange={(event) => setField('deliveryAddress2', event.target.value)} /></label>
          <label>City<input value={form.deliveryCity} onChange={(event) => setField('deliveryCity', event.target.value)} /></label>
          <label>State<input value={form.deliveryState} onChange={(event) => setField('deliveryState', event.target.value.toUpperCase())} maxLength={2} /></label>
          <label>Postal Code<input value={form.deliveryPostalCode} onChange={(event) => setField('deliveryPostalCode', event.target.value)} /></label>
          <label>Scheduled Date/Time<input type="datetime-local" value={form.deliveryScheduledDateTime} onChange={(event) => setField('deliveryScheduledDateTime', event.target.value)} /></label>
        </div>

        {form.scenarioKey === 'TENDER_REJECTED' && (
          <div className="editor-stack">
            <h3>Rejection</h3>
            <label>Reason Code<input value={form.rejectionReasonCode} onChange={(event) => setField('rejectionReasonCode', event.target.value)} /></label>
            <label>Message<input value={form.rejectionMessage} onChange={(event) => setField('rejectionMessage', event.target.value)} /></label>
          </div>
        )}
      </section>
      )}

      <button className="primary-button" type="button" disabled={createDisabled} onClick={onCreate}>
        <Play size={16} />
        Create Run
      </button>
      {readiness.status !== 'ready' && <small>Complete dependency readiness before creating a run.</small>}
    </div>
  );
}

function FailureDrillSetup({
  scenario,
  form,
  onChange,
}: {
  scenario: LabScenario;
  form: LabFormState;
  onChange: (field: keyof LabFormState, value: string) => void;
}) {
  const expected = scenario.expectedFailure ?? {};
  return (
    <section className="content-grid two-column">
      <article className="lab-scenario-summary">
        <strong>Failure Drill</strong>
        <span>{scenario.description}</span>
        <span>{scenario.guidance}</span>
        <small>Injected Fault: {scenario.injectedFault}</small>
      </article>
      <article className="lab-scenario-summary">
        <strong>Expected Failure</strong>
        <span>Code: {String(expected.errorCode ?? 'Pending')}</span>
        <span>Category: {String(expected.category ?? 'Pending')}</span>
        <span>Stage: {String(expected.stage ?? 'Pending')}</span>
        <span>Retryable: {String(expected.retryable ?? false)}</span>
        <small>{String(expected.transport ?? 'Pre-ingestion')} / {String(expected.documentType ?? 'Transport probe')}</small>
      </article>
      <label>
        Load ID
        <input value={form.loadId} onChange={(event) => onChange('loadId', event.target.value)} placeholder="Auto-generate" />
      </label>
      <p className="muted-text">
        Fault mutation is selected by this predefined drill. The browser does not submit credentials, headers, endpoints, or editable message bodies.
      </p>
    </section>
  );
}

function RunDetail({
  run,
  isWorking,
  onRunStep,
  onRunNext,
  onRunAll,
  onStop,
}: {
  run: LabRun;
  isWorking: boolean;
  onRunStep: (step: LabStep) => void;
  onRunNext: () => void;
  onRunAll: () => void;
  onStop: () => void;
}) {
  const technicalAck = String(run.resultSummary.technicalAcknowledgment ?? 'PENDING');
  const tenderStatus = String(run.resultSummary.tenderStatus ?? 'PENDING');
  const shipmentStatus = String(run.resultSummary.shipmentStatus ?? 'PENDING');
  const completed = run.steps.filter((step) => step.status === 'SUCCEEDED').length;
  const preview = find204Preview(run);
  const events = Array.isArray(run.resultSummary.shipmentEvents) ? run.resultSummary.shipmentEvents : [];
  const apexPayload = findApexPayload(run);
  const canonicalShipment = findCanonicalShipment(run);
  const technicalAckDetail = asRecord(run.resultSummary.technicalAcknowledgmentDetail);
  const nextRunnableKey = nextRunnableStepKey(run.steps);
  const failureDrill = asRecord(run.resultSummary.failureDrill);

  return (
    <section className="page-stack" data-testid="lab-run-detail">
      <article className="panel">
        <div className="panel-header">
          <h2>{run.businessIdentifier}</h2>
          <StatusBadge value={run.status} />
        </div>
        <dl className="definition-grid">
          <div><dt>Label</dt><dd>Synthetic Integration Test</dd></div>
          <div><dt>Scenario</dt><dd>{run.scenarioKey}</dd></div>
          <div><dt>Run Status</dt><dd><StatusBadge value={run.status} /></dd></div>
          <div><dt>Load ID</dt><dd>{run.businessIdentifier}</dd></div>
          <div><dt>997 Technical Ack</dt><dd>{technicalAck}</dd></div>
          {technicalAckDetail && (
            <>
              <div><dt>AK5</dt><dd>{String(technicalAckDetail.ak5 ?? 'Pending')}</dd></div>
              <div><dt>AK9</dt><dd>{String(technicalAckDetail.ak9 ?? 'Pending')}</dd></div>
            </>
          )}
          <div><dt>990 Business Response</dt><dd>{tenderStatus}</dd></div>
          <div><dt>Shipment Status</dt><dd>{shipmentStatus}</dd></div>
          <div><dt>Steps</dt><dd>{completed} / {run.steps.length}</dd></div>
          <div><dt>Created</dt><dd>{formatDateTime(run.createdAt)}</dd></div>
          <div><dt>Started</dt><dd>{run.startedAt ? formatDateTime(run.startedAt) : 'Pending'}</dd></div>
          <div><dt>Completed</dt><dd>{run.completedAt ? formatDateTime(run.completedAt) : 'Pending'}</dd></div>
        </dl>
        <div className="lab-actions">
          <button className="primary-button" type="button" disabled={isWorking || run.status === 'SUCCEEDED'} onClick={onRunNext}>
            <Play size={16} />
            Run Next Step
          </button>
          <button className="secondary-button" type="button" disabled={isWorking || run.status === 'SUCCEEDED'} onClick={onRunAll}>
            <FastForward size={16} />
            Run All Remaining
          </button>
          <button className="secondary-button" type="button" disabled={!isWorking} onClick={onStop}>
            <Square size={16} />
            Stop After Current Step
          </button>
          <Link className="secondary-button" to={`/trace/${encodeURIComponent(run.businessIdentifier)}`}>Business Trace</Link>
        </div>
      </article>

      {failureDrill && <FailureDrillResult run={run} drill={failureDrill} />}

      <section className="lab-lanes" aria-label="Integration path">
        {lanes.map((lane) => (
          <article className="panel" key={lane}>
            <div className="panel-header"><h2>{lane}</h2></div>
            <div className="compact-list">
              {run.steps
                .filter((step) => step.sender === lane || step.receiver === lane)
                .map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    isWorking={isWorking}
                    canRun={step.stepKey === nextRunnableKey}
                    onRunStep={onRunStep}
                  />
                ))}
            </div>
          </article>
        ))}
      </section>

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header"><h2>Apex Load Tender</h2></div>
          <dl className="definition-grid">
            <div><dt>Load ID</dt><dd>{String(apexPayload.loadId ?? run.businessIdentifier)}</dd></div>
            <div><dt>Equipment</dt><dd>{String(apexPayload.equipmentType ?? 'Pending')}</dd></div>
            <div><dt>Pickup</dt><dd>{locationLine(asRecord(apexPayload.pickup))}</dd></div>
            <div><dt>Delivery</dt><dd>{locationLine(asRecord(apexPayload.delivery))}</dd></div>
          </dl>
          <pre className="lab-preview" aria-label="Apex Load Tender JSON">{JSON.stringify(apexPayload, null, 2)}</pre>
        </article>

        <article className="panel">
          <div className="panel-header"><h2>Canonical Shipment</h2></div>
          <dl className="definition-grid">
            <div><dt>Shipment</dt><dd>{String(canonicalShipment.shipmentNumber ?? run.businessIdentifier)}</dd></div>
            <div><dt>Weight</dt><dd>{String(canonicalShipment.weightLbs ?? 'Pending')}</dd></div>
            <div><dt>Pieces</dt><dd>{String(canonicalShipment.pieces ?? 'Pending')}</dd></div>
            <div><dt>Commodity</dt><dd>{String(canonicalShipment.commodityDescription ?? 'Pending')}</dd></div>
          </dl>
          <pre className="lab-preview" aria-label="Canonical Shipment Summary">{JSON.stringify(canonicalShipment, null, 2)}</pre>
        </article>
      </section>

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header"><h2>Midwest 204</h2></div>
          {preview ? (
            <>
              <dl className="definition-grid">
                <div><dt>ISA13</dt><dd>{String(preview.interchangeControlNumber ?? 'Pending')}</dd></div>
                <div><dt>GS06</dt><dd>{String(preview.groupControlNumber ?? 'Pending')}</dd></div>
                <div><dt>ST02</dt><dd>{String(preview.transactionControlNumber ?? 'Pending')}</dd></div>
                <div><dt>Mapping</dt><dd>{mappingLink(preview)}</dd></div>
                <div><dt>Mapping Version</dt><dd>{String(preview.mappingProfileVersion ?? 'configured')}</dd></div>
                <div><dt>Payload SHA-256</dt><dd>{String(preview.payloadSha256 ?? 'Pending')}</dd></div>
                <div><dt>SFTP Filename</dt><dd>{String(preview.fileName ?? find204Dispatch(run)?.fileName ?? 'Pending')}</dd></div>
                <div><dt>Remote Path</dt><dd>{String(preview.remotePath ?? find204Dispatch(run)?.remotePath ?? 'Pending')}</dd></div>
              </dl>
              <pre className="lab-preview" aria-label="Midwest 204 X12">{String(preview.x12 ?? '')}</pre>
            </>
          ) : (
            <EmptyBlock title="204 preview pending" />
          )}
        </article>

        <article className="panel">
          <div className="panel-header"><h2>Transactions</h2></div>
          <StepTransactions run={run} />
        </article>
      </section>

      <article className="panel">
        <div className="panel-header"><h2>214 Progression</h2></div>
        {!events.length ? (
          <EmptyBlock title="No shipment events received" />
        ) : (
          <ul className="timeline">
            {events.map((event, index) => {
              const item = event as Record<string, unknown>;
              return (
                <li key={`${String(item.status)}-${index}`}>
                  <span>{String(item.occurredAt ?? '')}</span>
                  <strong>{String(item.status ?? '')}</strong>
                  <p>{String(item.city ?? '')}, {String(item.state ?? '')}</p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}

function FailureDrillResult({ run, drill }: { run: LabRun; drill: Record<string, unknown> }) {
  const expected = asRecord(drill.expected) ?? {};
  const observed = asRecord(drill.observed) ?? {};
  const errorId = typeof observed.errorId === 'string' ? observed.errorId : null;
  const transactionId = typeof observed.transactionId === 'string' ? observed.transactionId : null;
  const observedBusinessIdentifier =
    typeof observed.businessIdentifier === 'string' && observed.businessIdentifier.trim()
      ? observed.businessIdentifier.trim()
      : null;
  const errorCode = String(observed.errorCode ?? expected.errorCode ?? '');
  const queueQuery = new URLSearchParams({ errorCode });
  if (observedBusinessIdentifier) queueQuery.set('businessIdentifier', observedBusinessIdentifier);
  const payloadPreview = drill.payloadPreview;

  return (
    <section className="content-grid two-column" data-testid="failure-drill-result">
      <article className="panel">
        <div className="panel-header">
          <h2>Failure Drill</h2>
          <StatusBadge value={String(drill.drillOutcome ?? 'EXPECTED_FAILURE_OBSERVED')} />
        </div>
        <dl className="definition-grid">
          <div><dt>Result</dt><dd>EXPECTED FAILURE OBSERVED</dd></div>
          <div><dt>Lab Run</dt><dd><StatusBadge value={run.status} /></dd></div>
          <div><dt>Integration Transaction</dt><dd>{transactionId ? 'FAILED' : 'No transaction created'}</dd></div>
          <div><dt>Observed Business ID</dt><dd>{observedBusinessIdentifier ?? 'Not available - failure occurred before business identification'}</dd></div>
          <div><dt>Injected Fault</dt><dd>{String(drill.injectedFault ?? 'Controlled synthetic fault')}</dd></div>
          <div><dt>Transport</dt><dd>{String(observed.transport ?? expected.transport ?? 'Pre-ingestion')}</dd></div>
          <div><dt>Document</dt><dd>{String(observed.documentType ?? expected.documentType ?? 'Transport probe')}</dd></div>
        </dl>
        <p className="muted-text">
          {String(drill.transactionStatusExplanation ?? 'The drill succeeded because the expected integration failure was correctly produced and recorded.')}
        </p>
        {!transactionId && (
          <p className="muted-text">Failure occurred before an integration transaction could be created.</p>
        )}
        <div className="lab-actions">
          {errorId && <Link className="secondary-button" to={`/failures/${errorId}`}>View Failure</Link>}
          {transactionId && <Link className="secondary-button" to={`/transactions/${transactionId}`}>View Failed Transaction</Link>}
          <Link className="secondary-button" to={`/failures?${queueQuery.toString()}`}>Open Failure Queue</Link>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header"><h2>Expected vs Observed</h2></div>
        <section className="content-grid two-column">
          <div className="lab-scenario-summary">
            <strong>Expected</strong>
            <span>Code: {String(expected.errorCode ?? 'Pending')}</span>
            <span>Category: {String(expected.category ?? 'Pending')}</span>
            <span>Stage: {String(expected.stage ?? 'Pending')}</span>
            <span>Retryable: {String(expected.retryable ?? false)}</span>
          </div>
          <div className="lab-scenario-summary">
            <strong>Observed</strong>
            <span>Code: {String(observed.errorCode ?? 'Pending')}</span>
            <span>Category: {String(observed.category ?? 'Pending')}</span>
            <span>Stage: {String(observed.stage ?? 'Pending')}</span>
            <span>Retryable: {String(observed.retryable ?? false)}</span>
            <span>Status: {String(observed.processingStatus ?? 'Pre-ingestion')}</span>
          </div>
        </section>
        <p className="muted-text">{String(drill.guidance ?? '')}</p>
        {payloadPreview !== null && payloadPreview !== undefined && (
          <pre className="lab-preview" aria-label="Read-only failure payload preview">
            {typeof payloadPreview === 'string' ? payloadPreview : JSON.stringify(payloadPreview, null, 2)}
          </pre>
        )}
      </article>
    </section>
  );
}

function StepCard({
  step,
  isWorking,
  canRun,
  onRunStep,
}: {
  step: LabStep;
  isWorking: boolean;
  canRun: boolean;
  onRunStep: (step: LabStep) => void;
}) {
  const failed = step.status === 'FAILED';
  const runnable = (step.status === 'PENDING' || failed) && canRun;

  return (
    <div className="compact-row lab-step-card">
      <div>
        <strong>{step.displayName}</strong>
        <span>{step.sender} to {step.receiver} / {step.documentType} / {step.transport}</span>
        {step.errorCode && <span>{step.errorCode}: {step.safeMessage}</span>}
        {!runnable && step.status === 'PENDING' && <span>Complete previous step first.</span>}
      </div>
      <div className="lab-step-actions">
        <StatusBadge value={step.status} />
        <button className="secondary-button" type="button" disabled={isWorking || !runnable} onClick={() => onRunStep(step)}>
          {failed ? <RotateCcw size={16} /> : <Play size={16} />}
          {failed ? 'Retry Step' : 'Run Step'}
        </button>
      </div>
    </div>
  );
}

function StepTransactions({ run }: { run: LabRun }) {
  const rows = run.steps.filter((step) => step.relatedTransactionIds.length > 0);
  if (!rows.length) return <EmptyBlock title="No transactions yet" />;
  return (
    <div className="compact-list">
      {rows.map((step) => (
        <div className="compact-row" key={step.id}>
          <div>
            <strong>{step.documentType}</strong>
            <span>{step.displayName}</span>
            {step.relatedTransactionIds.map((transactionId) => (
              <Link key={transactionId} to={`/transactions/${transactionId}`}>View Transaction {transactionId.slice(0, 8)}</Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function toCreateRequest(form: LabFormState): LabRunCreateRequest {
  const request: LabRunCreateRequest = {
    scenarioKey: form.scenarioKey,
    loadId: optionalText(form.loadId),
    bolNumber: optionalText(form.bolNumber),
    purchaseOrderNumber: optionalText(form.purchaseOrderNumber),
    customerReference: optionalText(form.customerReference),
    equipmentType: form.equipmentType,
    weightLbs: optionalNumber(form.weightLbs),
    pieces: optionalNumber(form.pieces),
    commodityDescription: optionalText(form.commodityDescription),
    pickup: {
      facilityName: optionalText(form.pickupFacilityName),
      address1: optionalText(form.pickupAddress1),
      address2: optionalText(form.pickupAddress2),
      city: optionalText(form.pickupCity),
      state: optionalText(form.pickupState),
      postalCode: optionalText(form.pickupPostalCode),
      scheduledDateTime: optionalDateTime(form.pickupScheduledDateTime),
    },
    delivery: {
      facilityName: optionalText(form.deliveryFacilityName),
      address1: optionalText(form.deliveryAddress1),
      address2: optionalText(form.deliveryAddress2),
      city: optionalText(form.deliveryCity),
      state: optionalText(form.deliveryState),
      postalCode: optionalText(form.deliveryPostalCode),
      scheduledDateTime: optionalDateTime(form.deliveryScheduledDateTime),
    },
  };
  if (form.scenarioKey === 'TENDER_REJECTED') {
    request.rejectionReasonCode = optionalText(form.rejectionReasonCode);
    request.rejectionMessage = optionalText(form.rejectionMessage);
  }
  return stripUndefined(request) as LabRunCreateRequest;
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

function optionalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalDateTime(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    );
  }
  return value;
}

function nextRunnableStepKey(steps: LabStep[]): string | null {
  const succeeded = new Set(steps.filter((step) => step.status === 'SUCCEEDED').map((step) => step.stepKey));
  for (const step of steps) {
    if (step.status !== 'PENDING' && step.status !== 'FAILED') continue;
    const prior = steps.filter((candidate) => candidate.sequence < step.sequence);
    if (prior.every((candidate) => succeeded.has(candidate.stepKey))) return step.stepKey;
  }
  return null;
}

function find204Preview(run: LabRun): Record<string, unknown> | null {
  const dispatch = find204Dispatch(run);
  const preview = dispatch?.x12Preview;
  return preview && typeof preview === 'object' ? preview as Record<string, unknown> : null;
}

function find204Dispatch(run: LabRun): Record<string, unknown> | null {
  const step = run.steps.find((candidate) => candidate.stepKey === 'DISPATCH_204_SFTP');
  return step?.responseSummary ?? null;
}

function findApexPayload(run: LabRun): Record<string, unknown> {
  const step = run.steps.find((candidate) => candidate.stepKey === 'CREATE_APEX_LOAD');
  const fromResponse = asRecord(step?.responseSummary.apexLoadTenderJson);
  const fromRequest = asRecord(step?.requestSummary.apexLoadTenderJson);
  return fromResponse ?? fromRequest ?? run.inputSnapshot;
}

function findCanonicalShipment(run: LabRun): Record<string, unknown> {
  const fromSummary = asRecord(run.resultSummary.canonicalShipment);
  const fromDispatch = asRecord(find204Dispatch(run)?.canonicalShipment);
  return fromSummary ?? fromDispatch ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function locationLine(location: Record<string, unknown> | null): string {
  if (!location) return 'Pending';
  const facility = String(location.facilityName ?? '');
  const city = String(location.city ?? '');
  const state = String(location.state ?? '');
  return [facility, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' / ') || 'Pending';
}

function mappingLink(preview: Record<string, unknown>) {
  const mappingProfileId = preview.mappingProfileId;
  const mappingKey = String(preview.mappingKey ?? 'Mapping Profile');
  return typeof mappingProfileId === 'string' && mappingProfileId
    ? <Link to={`/mappings/${mappingProfileId}`}>{mappingKey}</Link>
    : mappingKey;
}

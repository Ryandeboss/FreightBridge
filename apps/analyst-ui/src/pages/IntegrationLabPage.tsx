import { FastForward, Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  createLabRun,
  executeLabStep,
  fetchLabReadiness,
  fetchLabRuns,
  runNextLabStep,
  type LabReadiness,
  type LabRun,
  type LabScenario,
  type LabStep,
} from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { PageTitle } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/dates';

const lanes = ['Apex Logistics', 'FreightBridge', 'Midwest Carrier'];

export function IntegrationLabPage() {
  const { token, handleApiError } = useOperationsSession();
  const [readiness, setReadiness] = useState<LabReadiness | null>(null);
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<LabRun | null>(null);
  const [scenarioKey, setScenarioKey] = useState('FULL_SHIPMENT_LIFECYCLE');
  const [loadId, setLoadId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopAfterCurrent = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const [nextReadiness, nextRuns] = await Promise.all([
        fetchLabReadiness(token),
        fetchLabRuns(token, { limit: 12, offset: 0 }),
      ]);
      setReadiness(nextReadiness);
      setRuns(nextRuns.runs);
      setSelectedRun((current) => current ?? nextRuns.runs[0] ?? null);
      if (!nextReadiness.scenarios.some((scenario) => scenario.scenarioKey === scenarioKey)) {
        setScenarioKey(nextReadiness.scenarios[0]?.scenarioKey ?? 'FULL_SHIPMENT_LIFECYCLE');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Integration Lab could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, scenarioKey, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRun() {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    try {
      const run = await createLabRun(token, {
        scenarioKey,
        loadId: loadId.trim() || undefined,
      });
      setSelectedRun(run);
      setLoadId('');
      const nextRuns = await fetchLabRuns(token, { limit: 12, offset: 0 });
      setRuns(nextRuns.runs);
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

  const selectedScenario = readiness?.scenarios.find((scenario) => scenario.scenarioKey === scenarioKey);

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
                <h2>New Run</h2>
                <StatusBadge value={readiness.status} />
              </div>
              <div className="editor-stack">
                <label>
                  Scenario
                  <select value={scenarioKey} onChange={(event) => setScenarioKey(event.target.value)}>
                    {readiness.scenarios.map((scenario) => (
                      <option key={scenario.scenarioKey} value={scenario.scenarioKey}>
                        {scenario.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedScenario && <ScenarioSummary scenario={selectedScenario} />}
                <label>
                  Load ID
                  <input value={loadId} onChange={(event) => setLoadId(event.target.value)} placeholder="Auto-generate" />
                </label>
                <button className="primary-button" type="button" disabled={isWorking} onClick={createRun}>
                  <Play size={16} />
                  Create Run
                </button>
              </div>
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
                    <button
                      key={run.id}
                      className={`compact-row lab-run-row ${selectedRun?.id === run.id ? 'active' : ''}`}
                      type="button"
                      onClick={() => setSelectedRun(run)}
                    >
                      <div>
                        <strong>{run.businessIdentifier}</strong>
                        <span>{run.scenarioKey}</span>
                      </div>
                      <StatusBadge value={run.status} />
                    </button>
                  ))}
                </div>
              )}
            </article>
          </section>

          {selectedRun && (
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
          )}
        </>
      )}
    </section>
  );
}

function ScenarioSummary({ scenario }: { scenario: LabScenario }) {
  return (
    <div className="lab-scenario-summary">
      <strong>{scenario.scenarioKey}</strong>
      <span>{scenario.description}</span>
      <small>{scenario.stepCount} steps</small>
    </div>
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

  return (
    <section className="page-stack" data-testid="lab-run-detail">
      <article className="panel">
        <div className="panel-header">
          <h2>{run.businessIdentifier}</h2>
          <StatusBadge value={run.status} />
        </div>
        <dl className="definition-grid">
          <div>
            <dt>Scenario</dt>
            <dd>{run.scenarioKey}</dd>
          </div>
          <div>
            <dt>Run Status</dt>
            <dd><StatusBadge value={run.status} /></dd>
          </div>
          <div>
            <dt>Load ID</dt>
            <dd>{run.businessIdentifier}</dd>
          </div>
          <div>
            <dt>Technical Ack</dt>
            <dd>{technicalAck}</dd>
          </div>
          <div>
            <dt>Tender Status</dt>
            <dd>{tenderStatus}</dd>
          </div>
          <div>
            <dt>Shipment Status</dt>
            <dd>{shipmentStatus}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{completed} / {run.steps.length}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(run.createdAt)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{run.completedAt ? formatDateTime(run.completedAt) : 'Pending'}</dd>
          </div>
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
          <Link className="secondary-button" to={`/trace/${encodeURIComponent(run.businessIdentifier)}`}>
            Business Trace
          </Link>
        </div>
      </article>

      <section className="lab-lanes" aria-label="Integration path">
        {lanes.map((lane) => (
          <article className="panel" key={lane}>
            <div className="panel-header">
              <h2>{lane}</h2>
            </div>
            <div className="compact-list">
              {run.steps
                .filter((step) => step.sender === lane || step.receiver === lane)
                .map((step) => (
                  <StepCard key={step.id} step={step} isWorking={isWorking} onRunStep={onRunStep} />
                ))}
            </div>
          </article>
        ))}
      </section>

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h2>Message Inspector</h2>
          </div>
          <dl className="definition-grid">
            <div>
              <dt>Apex JSON</dt>
              <dd>{String(run.inputSnapshot.loadId ?? run.businessIdentifier)}</dd>
            </div>
            <div>
              <dt>Canonical Shipment</dt>
              <dd>{run.businessIdentifier}</dd>
            </div>
            <div>
              <dt>Transactions</dt>
              <dd>{transactionIds(run).length}</dd>
            </div>
            <div>
              <dt>997 Technical Ack</dt>
              <dd>{technicalAck}</dd>
            </div>
            <div>
              <dt>990 Business Response</dt>
              <dd>{tenderStatus}</dd>
            </div>
            <div>
              <dt>Mapping</dt>
              <dd><Link to="/mappings">Mapping Profiles</Link></dd>
            </div>
          </dl>
          <pre className="lab-preview">{JSON.stringify({ input: run.inputSnapshot, result: run.resultSummary }, null, 2)}</pre>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Midwest 204 Preview</h2>
          </div>
          {preview ? (
            <>
              <dl className="definition-grid">
                <div><dt>ISA13</dt><dd>{String(preview.interchangeControlNumber ?? 'Pending')}</dd></div>
                <div><dt>GS06</dt><dd>{String(preview.groupControlNumber ?? 'Pending')}</dd></div>
                <div><dt>ST02</dt><dd>{String(preview.transactionControlNumber ?? 'Pending')}</dd></div>
                <div><dt>Mapping Version</dt><dd>{String(preview.mappingSpecVersion ?? 'configured')}</dd></div>
                <div><dt>SFTP Filename</dt><dd>{String(find204Dispatch(run)?.fileName ?? 'Pending')}</dd></div>
              </dl>
              <pre className="lab-preview">{String(preview.x12 ?? '')}</pre>
            </>
          ) : (
            <EmptyBlock title="204 preview pending" />
          )}
        </article>
      </section>

      <article className="panel">
        <div className="panel-header">
          <h2>214 Progression</h2>
        </div>
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

function StepCard({ step, isWorking, onRunStep }: { step: LabStep; isWorking: boolean; onRunStep: (step: LabStep) => void }) {
  const failed = step.status === 'FAILED';
  const runnable = step.status === 'PENDING' || failed;

  return (
    <div className="compact-row lab-step-card">
      <div>
        <strong>{step.displayName}</strong>
        <span>{step.sender} to {step.receiver} / {step.documentType} / {step.transport}</span>
        {step.errorCode && <span>{step.errorCode}: {step.safeMessage}</span>}
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

function find204Preview(run: LabRun): Record<string, unknown> | null {
  const dispatch = find204Dispatch(run);
  const preview = dispatch?.x12Preview;
  return preview && typeof preview === 'object' ? preview as Record<string, unknown> : null;
}

function find204Dispatch(run: LabRun): Record<string, unknown> | null {
  const step = run.steps.find((candidate) => candidate.stepKey === 'DISPATCH_204_SFTP');
  return step?.responseSummary ?? null;
}

function transactionIds(run: LabRun): string[] {
  return Array.from(new Set(run.steps.flatMap((step) => step.relatedTransactionIds)));
}

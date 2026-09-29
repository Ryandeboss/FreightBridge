import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Braces,
  CheckCircle2,
  Circle,
  Code2,
  Database,
  FileJson2,
  Play,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, executeLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  HEALTHY_WALKTHROUGH_STORAGE_KEY,
  loadHealthyWalkthroughState,
  saveHealthyApexTenderProgress,
} from '../training/healthyWalkthrough';
import {
  findApexPayload,
  findCanonicalShipment,
  findStep,
  locationLine,
  rawEvidence,
} from '../training/labEvidence';

type EvidenceMode = 'business' | 'technical' | 'raw';

const inboundChecks = [
  ['received', 'Request arrived', 'FreightBridge received the Apex REST request.'],
  ['authenticated', 'Authentication passed', 'The partner credential passed the inbound authentication boundary.'],
  ['parsed', 'JSON parsed', 'FreightBridge could read the body as structured JSON.'],
  ['validated', 'Contract validation passed', 'Required Apex shipment fields satisfied the inbound contract.'],
  ['canonical', 'Canonical shipment created', 'FreightBridge normalized the partner payload into its internal shipment model.'],
] as const;

export function HealthyApexTenderPage() {
  const { token, handleApiError } = useOperationsSession();
  const saved = loadHealthyWalkthroughState();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EvidenceMode>('business');
  const [complete, setComplete] = useState(saved?.part1Complete === true);

  const createStep = findStep(run, 'CREATE_APEX_LOAD');
  const dispatchStep = findStep(run, 'DISPATCH_APEX_TENDER');
  const prepared = createStep?.status === 'SUCCEEDED';
  const accepted = dispatchStep?.status === 'SUCCEEDED';
  const apexPayload = useMemo(() => findApexPayload(run), [run]);
  const canonical = useMemo(() => findCanonicalShipment(run), [run]);
  const canonicalCreated = Object.keys(canonical).length > 0;
  const canComplete = Boolean(run && accepted && canonicalCreated);

  async function start() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setComplete(false);
    try {
      setRun(await createLabRun(token, {
        scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
        loadId: `GUIDE${Date.now().toString(36).toUpperCase()}`.slice(0, 30),
        commodityDescription: 'Guided Training Freight',
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
      }));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The guided Lab run could not be created.');
    } finally {
      setWorking(false);
    }
  }

  async function execute(stepKey: 'CREATE_APEX_LOAD' | 'DISPATCH_APEX_TENDER') {
    if (!token || !run) return;
    setWorking(true);
    setError(null);
    try {
      const result = await executeLabStep(token, run.id, stepKey);
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The guided step could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function finish() {
    if (!run || !canComplete) return;
    saveHealthyApexTenderProgress(run.id, run.businessIdentifier);
    setComplete(true);
  }

  return (
    <section className="healthy-guide" data-testid="healthy-apex-tender-page">
      <Link className="secondary-button training-back-link" to="/learn"><ArrowLeft size={16} />Ops Desk</Link>

      <header className="healthy-guide-header">
        <div>
          <p className="eyebrow">Healthy Shipment Walkthrough · Part 1</p>
          <h1>A new Apex tender arrives</h1>
          <p>Follow one real simulated load from Apex into FreightBridge. Stop once the inbound JSON becomes a canonical shipment — before any Midwest 204 exists.</p>
        </div>
        <div className="healthy-guide-boundary"><span>Today&apos;s boundary</span><strong>Apex → FreightBridge</strong><small>REST API · JSON</small></div>
      </header>

      <section className="healthy-top-grid">
        <article className="panel healthy-assignment" data-testid="healthy-assignment">
          <div className="healthy-message"><div className="ops-manager-avatar">M</div><div><strong>Mike</strong><small>Integration Manager</small></div></div>
          <p>“Watch what FreightBridge proves at each inbound checkpoint. Don&apos;t jump to EDI yet — Midwest has not received anything.”</p>
          {!run ? (
            <button className="primary-button" type="button" onClick={start} disabled={working}><Play size={16} />Start Healthy Walkthrough</button>
          ) : (
            <div className="healthy-load"><span>Follow this load</span><strong>{run.businessIdentifier}</strong><small>Lab run {run.id}</small></div>
          )}
        </article>

        <article className="panel healthy-business-flow">
          <p className="eyebrow">Business meaning</p>
          <h2>What is happening?</h2>
          <div><span><strong>Apex</strong><small>“Please move this load.”</small></span><ArrowRight size={18} /><span className="active"><strong>FreightBridge</strong><small>Receive · verify · normalize</small></span><ArrowRight size={18} /><span className="future"><strong>Midwest</strong><small>Not involved yet</small></span></div>
        </article>
      </section>

      {saved?.part1Complete && !run && (
        <article className="panel healthy-saved" data-testid="healthy-saved-run"><CheckCircle2 size={19} /><div><strong>Part 1 was already completed for {saved.loadId}.</strong><p>Saved Lab run: {saved.runId}. Part 2 can continue this same shipment.</p></div></article>
      )}

      {error && <article className="panel training-alert" role="alert"><AlertTriangle size={20} /><div><h2>This checkpoint did not complete.</h2><p>{error}</p><Link className="secondary-button" to={run ? `/lab/runs/${run.id}` : '/lab'}>Inspect Lab Run</Link></div></article>}

      <section className="healthy-step-grid">
        <article className={`healthy-step ${prepared ? 'complete' : run ? 'current' : ''}`}>
          <div className="healthy-step-number">{prepared ? <CheckCircle2 size={17} /> : '1'}</div>
          <div><p className="eyebrow">Partner side</p><h2>Apex prepares the tender</h2><p>This creates the synthetic load at Apex. FreightBridge has not received the business request yet.</p>
            {run && !prepared && <button className="primary-button" type="button" onClick={() => execute('CREATE_APEX_LOAD')} disabled={working}><FileJson2 size={16} />Prepare Apex Tender</button>}
            {prepared && <div className="healthy-result"><CheckCircle2 size={17} />Apex has a valid load ready to send.</div>}
          </div>
        </article>

        <article className={`healthy-step ${accepted ? 'complete' : prepared ? 'current' : ''}`}>
          <div className="healthy-step-number">{accepted ? <CheckCircle2 size={17} /> : '2'}</div>
          <div><p className="eyebrow">Integration boundary</p><h2>Apex sends REST + JSON to FreightBridge</h2><p>The same tender now crosses the real Apex → FreightBridge inbound integration.</p>
            {prepared && !accepted && <button className="primary-button" type="button" onClick={() => execute('DISPATCH_APEX_TENDER')} disabled={working}><Send size={16} />Send Tender to FreightBridge</button>}
            {!prepared && <small>Prepare the Apex tender first.</small>}
            {accepted && <div className="healthy-result"><CheckCircle2 size={17} />FreightBridge accepted the Apex tender for processing.</div>}
          </div>
        </article>
      </section>

      {run && (
        <article className="panel healthy-evidence" data-testid="healthy-apex-evidence">
          <div className="healthy-evidence-head"><div><p className="eyebrow">Same message · three levels</p><h2>Inspect the Apex tender</h2></div><div className="healthy-tabs" role="group" aria-label="Apex evidence detail level">
            <button className={mode === 'business' ? 'selected' : ''} type="button" onClick={() => setMode('business')}>Business</button>
            <button className={mode === 'technical' ? 'selected' : ''} type="button" onClick={() => setMode('technical')}>Technical</button>
            <button className={mode === 'raw' ? 'selected' : ''} type="button" onClick={() => setMode('raw')}>Raw JSON</button>
          </div></div>

          {mode === 'business' && <div className="healthy-fields" data-testid="healthy-business-evidence">
            <div><span>Load</span><strong>{String(apexPayload.loadId ?? run.businessIdentifier)}</strong></div>
            <div><span>Pickup</span><strong>{locationLine(apexPayload.pickup)}</strong></div>
            <div><span>Delivery</span><strong>{locationLine(apexPayload.delivery)}</strong></div>
            <div><span>Equipment</span><strong>{String(apexPayload.equipmentType ?? 'VAN_53')}</strong></div>
            <div><span>Weight</span><strong>{String(apexPayload.weightLbs ?? 42000)} lbs</strong></div>
            <div><span>Commodity</span><strong>{String(apexPayload.commodityDescription ?? 'Guided Training Freight')}</strong></div>
          </div>}

          {mode === 'technical' && <div className="healthy-tech" data-testid="healthy-technical-evidence">
            <div><Code2 size={18} /><span><strong>Interface</strong><small>REST API</small></span></div>
            <div><Braces size={18} /><span><strong>Format</strong><small>JSON</small></span></div>
            <div><ShieldCheck size={18} /><span><strong>Authentication</strong><small>Checked server-side; secret never exposed</small></span></div>
            <div><Database size={18} /><span><strong>Result</strong><small>{accepted ? 'Accepted for processing' : 'Waiting for dispatch'}</small></span></div>
          </div>}

          {mode === 'raw' && <pre className="healthy-raw" data-testid="healthy-raw-json">{rawEvidence(apexPayload)}</pre>}
        </article>
      )}

      <article className="panel healthy-checks" data-testid="healthy-inbound-checkpoints">
        <div className="panel-header"><div><p className="eyebrow">Inside one inbound request</p><h2>What FreightBridge must prove</h2></div><span className="badge badge-info">{accepted ? 'Inbound accepted' : 'Waiting'}</span></div>
        <p className="muted-text">These are processing checkpoints inside one REST request — not five separate partner messages.</p>
        <div className="healthy-check-grid">
          {inboundChecks.map(([id, title, detail]) => {
            const done = id === 'canonical' ? canonicalCreated : accepted;
            return <div className={done ? 'complete' : ''} key={id} data-testid={`healthy-check-${id}`}>{done ? <CheckCircle2 size={18} /> : <Circle size={18} />}<span><strong>{title}</strong><small>{detail}</small></span></div>;
          })}
        </div>
      </article>

      {accepted && (
        <article className="panel healthy-canonical" data-testid="healthy-canonical-panel">
          <div className="panel-header"><div><p className="eyebrow">Normalized business object</p><h2>Partner JSON → FreightBridge canonical shipment</h2></div>{canonicalCreated && <span className="badge badge-success">Created</span>}</div>
          {canonicalCreated ? <>
            <p className="muted-text">FreightBridge now has one internal shipment model that later mappings can translate for Midwest.</p>
            <div className="healthy-map">
              <div><code>loadId</code><ArrowRight size={15} /><code>shipmentNumber</code></div>
              <div><code>pickup</code><ArrowRight size={15} /><code>origin</code></div>
              <div><code>delivery</code><ArrowRight size={15} /><code>destination</code></div>
              <div><code>equipmentType</code><ArrowRight size={15} /><code>equipmentType</code></div>
            </div>
            <div className="healthy-fields"><div><span>Shipment</span><strong>{String(canonical.shipmentNumber ?? run?.businessIdentifier ?? 'Pending')}</strong></div><div><span>Origin</span><strong>{locationLine(canonical.pickup ?? canonical.origin)}</strong></div><div><span>Destination</span><strong>{locationLine(canonical.delivery ?? canonical.destination)}</strong></div></div>
          </> : <p className="muted-text">Inbound accepted, but canonical evidence is still unavailable. Do not complete Part 1 yet.</p>}
        </article>
      )}

      {canComplete && <article className={`panel healthy-finish ${complete ? 'complete' : ''}`} data-testid="healthy-part1-completion"><div><p className="eyebrow">Last healthy checkpoint</p><h2>Canonical shipment created</h2><p>Part 1 stops here. Midwest has not received a 204. Part 2 will continue this exact Lab run into mapping and X12 generation.</p></div>{!complete ? <button className="primary-button" type="button" onClick={finish}><CheckCircle2 size={16} />Complete Part 1</button> : <div className="healthy-next"><CheckCircle2 size={18} /><span><strong>Part 1 complete.</strong><small>Saved under {HEALTHY_WALKTHROUGH_STORAGE_KEY}. Part 2 can resume run {run?.id ?? 'Pending'}.</small></span></div>}</article>}
    </section>
  );
}

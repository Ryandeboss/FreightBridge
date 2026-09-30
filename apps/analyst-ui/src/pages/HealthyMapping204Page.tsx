import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileText,
  Map,
  Play,
  Server,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { executeLabStep, fetchLabRun, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import {
  loadHealthyWalkthroughState,
  saveHealthyMapping204Progress,
} from '../training/healthyWalkthrough';
import {
  asRecord,
  find204Dispatch,
  find204Preview,
  findCanonicalShipment,
  findStep,
  locationLine,
} from '../training/labEvidence';

type WorkbenchMode = 'business' | 'segments' | 'raw';

type MappingRow = {
  id: string;
  label: string;
  businessMeaning: string;
  canonicalSource: string;
  destination: string;
  transformation: string;
  segmentId: string | null;
  canonicalValue: (shipment: Record<string, unknown>) => string;
  x12Value: (segments: X12SegmentView[]) => string;
};

type X12SegmentView = {
  segmentId: string;
  elements: string[];
  raw: string;
};

const mappingRows: MappingRow[] = [
  {
    id: 'shipment-number',
    label: 'Shipment identifier',
    businessMeaning: 'The load number lets Midwest connect this tender back to the Apex shipment FreightBridge normalized.',
    canonicalSource: 'shipment_number',
    destination: 'B2-04',
    transformation: 'Direct value. Midwest carrier code MWCX and payment method PP are profile defaults.',
    segmentId: 'B2',
    canonicalValue: (shipment) => text(shipment.shipmentNumber),
    x12Value: (segments) => segmentElement(segments, 'B2', 4),
  },
  {
    id: 'bol-reference',
    label: 'Bill of lading',
    businessMeaning: 'BOL is required by the current Midwest 204 profile.',
    canonicalSource: 'references[BOL].reference_value',
    destination: 'L11-01 with L11-02 = BM',
    transformation: 'Direct reference value with the Midwest BOL qualifier BM.',
    segmentId: 'L11',
    canonicalValue: (shipment) => referenceValue(shipment, 'BOL'),
    x12Value: (segments) => qualifiedSegmentValue(segments, 'L11', 'BM'),
  },
  {
    id: 'po-reference',
    label: 'Purchase order',
    businessMeaning: 'PO is sent when present, but its absence is not a mapping failure.',
    canonicalSource: 'references[PO].reference_value',
    destination: 'L11-01 with L11-02 = PO',
    transformation: 'Direct reference value when present; omit when absent.',
    segmentId: 'L11',
    canonicalValue: (shipment) => referenceValue(shipment, 'PO'),
    x12Value: (segments) => qualifiedSegmentValue(segments, 'L11', 'PO'),
  },
  {
    id: 'pickup-appointment',
    label: 'Pickup appointment',
    businessMeaning: 'Midwest needs the pickup appointment as X12 date and time values.',
    canonicalSource: 'origin.scheduled_at',
    destination: 'G62-02 and G62-04 with qualifiers 37/I',
    transformation: 'Format timezone-aware canonical timestamp in UTC as YYYYMMDD and HHMM.',
    segmentId: 'G62',
    canonicalValue: (shipment) => (
      nestedText(shipment, ['pickup', 'scheduledAt'])
      || nestedText(shipment, ['pickup', 'scheduledDateTime'])
      || nestedText(shipment, ['origin', 'scheduledAt'])
      || nestedText(shipment, ['origin', 'scheduledDateTime'])
    ),
    x12Value: (segments) => qualifiedDateTime(segments, '37'),
  },
  {
    id: 'pickup-location',
    label: 'Pickup shipper',
    businessMeaning: 'Origin party and location become the pickup stop loop.',
    canonicalSource: 'origin facility/address/city/state/postal',
    destination: 'S5*1*LD, N1*SH, N3, N4',
    transformation: 'Direct location fields inside the pickup stop loop.',
    segmentId: 'N1',
    canonicalValue: (shipment) => locationLine(shipment.pickup ?? shipment.origin),
    x12Value: (segments) => stopLoopSummary(segments, 'SH'),
  },
  {
    id: 'delivery-location',
    label: 'Delivery consignee',
    businessMeaning: 'Destination party and location become the delivery stop loop.',
    canonicalSource: 'destination facility/address/city/state/postal',
    destination: 'S5*2*UL, N1*CN, N3, N4',
    transformation: 'Direct location fields inside the delivery stop loop.',
    segmentId: 'N1',
    canonicalValue: (shipment) => locationLine(shipment.delivery ?? shipment.destination),
    x12Value: (segments) => stopLoopSummary(segments, 'CN'),
  },
  {
    id: 'weight-pieces',
    label: 'Weight and pieces',
    businessMeaning: 'Freight quantity becomes the Midwest shipment total.',
    canonicalSource: 'weight_lbs and pieces',
    destination: 'L3-01 and L3-05 with L3-02 = G',
    transformation: 'Decimal/integer values formatted as X12 numeric text.',
    segmentId: 'L3',
    canonicalValue: (shipment) => `${text(shipment.weightLbs)} lbs / ${text(shipment.pieces)} pieces`,
    x12Value: (segments) => {
      const l3 = segment(segments, 'L3');
      return l3 ? `${l3.elements[0] ?? 'Pending'} lbs / ${l3.elements[4] ?? 'Pending'} pieces` : 'Pending';
    },
  },
  {
    id: 'equipment',
    label: 'Equipment type',
    businessMeaning: 'FreightBridge keeps equipment in the canonical shipment, but the current Midwest 204 subset does not emit it.',
    canonicalSource: 'equipment_type',
    destination: 'Not emitted in current Midwest 204 subset',
    transformation: 'Intentionally ignored by the current mapping profile.',
    segmentId: null,
    canonicalValue: (shipment) => text(shipment.equipmentType),
    x12Value: () => 'Not emitted',
  },
];

const checks = [
  {
    id: 'creator',
    prompt: 'Who created the X12 204?',
    options: ['FreightBridge', 'Apex Logistics', 'Midwest Carrier'],
    answer: 'FreightBridge',
  },
  {
    id: 'canonical',
    prompt: 'Why use the canonical shipment?',
    options: [
      'It gives FreightBridge a neutral business model that can be translated into partner-specific formats.',
      'It replaces the Midwest implementation guide.',
      'It proves Midwest accepted the tender.',
    ],
    answer: 'It gives FreightBridge a neutral business model that can be translated into partner-specific formats.',
  },
  {
    id: 'accepted',
    prompt: 'Does placing the 204 on Midwest SFTP mean Midwest accepted the tender?',
    options: ['No', 'Yes'],
    answer: 'No',
  },
];

export function HealthyMapping204Page() {
  const { token, handleApiError } = useOperationsSession();
  const saved = loadHealthyWalkthroughState();
  const [run, setRun] = useState<LabRun | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState(mappingRows[0].id);
  const [mode, setMode] = useState<WorkbenchMode>('business');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(saved?.part2Complete === true);

  useEffect(() => {
    let active = true;
    async function loadSavedRun() {
      if (!token || !saved?.runId || !saved.loadId || saved.part1Complete !== true) return;
      setWorking(true);
      setError(null);
      try {
        const fetched = await fetchLabRun(token, saved.runId);
        if (!active) return;
        setRun(fetched);
        setComplete(saved.part2Complete === true);
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
  }, [token, saved?.runId, saved?.loadId, saved?.part1Complete, saved?.part2Complete, handleApiError]);

  const createStep = findStep(run, 'CREATE_APEX_LOAD');
  const apexDispatchStep = findStep(run, 'DISPATCH_APEX_TENDER');
  const dispatch204Step = findStep(run, 'DISPATCH_204_SFTP');
  const midwestReceiveStep = findStep(run, 'MIDWEST_RECEIVE_204');
  const canonical = useMemo(() => findCanonicalShipment(run), [run]);
  const dispatch = useMemo(() => find204Dispatch(run), [run]);
  const preview = useMemo(() => find204Preview(run), [run]);
  const rawX12 = typeof preview?.x12 === 'string' ? preview.x12 : '';
  const segments = useMemo(() => parseX12Segments(rawX12), [rawX12]);
  const selectedRow = mappingRows.find((row) => row.id === selectedRowId) ?? mappingRows[0];

  const missingSavedState = !saved?.runId || !saved.loadId || saved.part1Complete !== true;
  const savedRunMismatch = Boolean(run && saved && run.businessIdentifier !== saved.loadId);
  const part1Ready = createStep?.status === 'SUCCEEDED' && apexDispatchStep?.status === 'SUCCEEDED';
  const beyondPart2 = midwestReceiveStep?.status === 'SUCCEEDED';
  const dispatchSucceeded = dispatch204Step?.status === 'SUCCEEDED';
  const has204Evidence = Boolean(dispatchSucceeded && preview && rawX12);
  const checksPassed = checks.every((check) => answers[check.id] === check.answer);
  const canComplete = Boolean(run && part1Ready && has204Evidence && checksPassed && !savedRunMismatch && !beyondPart2);

  async function execute204() {
    if (!token || !run || !part1Ready || beyondPart2) return;
    setWorking(true);
    setError(null);
    try {
      const result = await executeLabStep(token, run.id, 'DISPATCH_204_SFTP');
      setRun(result.run);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'FreightBridge could not generate and send the Midwest 204.');
    } finally {
      setWorking(false);
    }
  }

  function finish() {
    if (!run || !saved || !canComplete) return;
    saveHealthyMapping204Progress(saved.runId, saved.loadId);
    setComplete(true);
  }

  if (missingSavedState) {
    return <RecoveryState title="Part 1 needs to be completed first" detail="This workstation continues the saved healthy shipment. Complete Part 1 so FreightBridge has a real Lab run and load ID to resume." />;
  }

  if (error || savedRunMismatch || beyondPart2 || (run && !part1Ready)) {
    const detail = savedRunMismatch
      ? `Saved load ${saved.loadId} did not match the Lab run returned by the server.`
      : beyondPart2
        ? 'This Lab run has already progressed into Midwest processing. Replaying Part 1 creates a clean run for this workbench.'
        : run && !part1Ready
          ? 'The saved Lab run has not completed CREATE_APEX_LOAD and DISPATCH_APEX_TENDER.'
          : error ?? 'The saved Lab run could not be resumed.';
    return <RecoveryState title="Resume the saved shipment from Part 1" detail={detail} runId={saved.runId} />;
  }

  return (
    <section className="healthy-guide healthy-mapping-page" data-testid="healthy-mapping-204-page">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Ops Desk</Link>

      <header className="healthy-guide-header">
        <div>
          <p className="eyebrow">Healthy Shipment Walkthrough - Part 2</p>
          <h1>Map the shipment into Midwest&apos;s 204</h1>
          <p>Good. FreightBridge understands Apex&apos;s shipment now. The next job is to translate our neutral shipment model into the format Midwest expects.</p>
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
          <Pipeline dispatched={dispatchSucceeded} />

          <section className="healthy-top-grid">
            <article className="panel healthy-assignment" data-testid="healthy-mapping-assignment">
              <div className="healthy-message"><div className="ops-manager-avatar">M</div><div><strong>Mike</strong><small>Integration Manager</small></div></div>
              <p>FreightBridge does not send Apex JSON to Midwest. We send the canonical shipment through the active Midwest 204 mapping and produce a partner-specific X12 load tender.</p>
              <div className="healthy-load"><span>Continue this load</span><strong>{run.businessIdentifier}</strong><small>Not a replacement shipment</small></div>
            </article>

            <article className="panel healthy-business-flow" data-testid="healthy-shipment-summary">
              <p className="eyebrow">Current shipment evidence</p>
              <h2>Canonical shipment ready for mapping</h2>
              <div className="healthy-fields">
                <div><span>Pickup</span><strong>{locationLine(canonical.pickup ?? canonical.origin)}</strong></div>
                <div><span>Delivery</span><strong>{locationLine(canonical.delivery ?? canonical.destination)}</strong></div>
                <div><span>Equipment</span><strong>{text(canonical.equipmentType)}</strong></div>
                <div><span>Weight</span><strong>{text(canonical.weightLbs)} lbs</strong></div>
                <div><span>Pieces</span><strong>{text(canonical.pieces)}</strong></div>
                <div><span>Status</span><strong>{dispatchSucceeded ? '204 delivered to inbound SFTP' : 'Ready to map'}</strong></div>
              </div>
            </article>
          </section>

          <section className="panel mapping-workbench" data-testid="mapping-workbench">
            <div className="panel-header">
              <div><p className="eyebrow">Mapping workbench</p><h2>Canonical FreightBridge field -&gt; Midwest X12 destination</h2></div>
              <span className="badge badge-info">CANONICAL_TO_MWCX_204</span>
            </div>
            <div className="mapping-workbench-grid">
              <div className="mapping-row-list" role="list" aria-label="Canonical to Midwest 204 mapping rows">
                {mappingRows.map((row) => (
                  <button
                    className={row.id === selectedRow.id ? 'selected' : ''}
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    <span>{row.label}</span>
                    <small>{row.canonicalSource} -&gt; {row.destination}</small>
                  </button>
                ))}
              </div>
              <article className="mapping-row-detail" data-testid="mapping-row-detail">
                <p className="eyebrow">Selected mapping</p>
                <h3>{selectedRow.label}</h3>
                <dl>
                  <div><dt>Business meaning</dt><dd>{selectedRow.businessMeaning}</dd></div>
                  <div><dt>Canonical source</dt><dd><code>{selectedRow.canonicalSource}</code></dd></div>
                  <div><dt>Midwest destination</dt><dd><code>{selectedRow.destination}</code></dd></div>
                  <div><dt>Transformation</dt><dd>{selectedRow.transformation}</dd></div>
                  <div><dt>Current shipment value</dt><dd>{selectedRow.canonicalValue(canonical) || 'Pending'}</dd></div>
                  <div><dt>Generated X12 value</dt><dd>{selectedRow.x12Value(segments) || (dispatchSucceeded ? 'Not emitted' : 'Pending until 204 generation')}</dd></div>
                </dl>
              </article>
            </div>
          </section>

          <article className="panel healthy-finish" data-testid="healthy-204-action">
            <div>
              <p className="eyebrow">Real Lab action</p>
              <h2>Generate &amp; Send Midwest 204</h2>
              <p>This executes the 204 dispatch step on the saved run. FreightBridge generates the X12 204, audits the payload, and places the file on Midwest inbound SFTP. Midwest has not processed it yet.</p>
            </div>
            {dispatchSucceeded ? (
              <div className="healthy-next"><CheckCircle2 size={18} /><span><strong>204 delivered to Midwest inbound SFTP.</strong><small>Stop here for Part 2.</small></span></div>
            ) : (
              <button className="primary-button" type="button" onClick={execute204} disabled={working || !part1Ready}>
                <Play size={16} />Generate &amp; Send Midwest 204
              </button>
            )}
          </article>

          {has204Evidence && (
            <>
              <section className="panel x12-explorer" data-testid="x12-204-explorer">
                <div className="healthy-evidence-head">
                  <div><p className="eyebrow">Generated tender evidence</p><h2>X12 204 explorer</h2></div>
                  <div className="healthy-tabs" role="group" aria-label="204 evidence detail level">
                    <button className={mode === 'business' ? 'selected' : ''} type="button" onClick={() => setMode('business')}>Business</button>
                    <button className={mode === 'segments' ? 'selected' : ''} type="button" onClick={() => setMode('segments')}>Segments</button>
                    <button className={mode === 'raw' ? 'selected' : ''} type="button" onClick={() => setMode('raw')}>Raw X12</button>
                  </div>
                </div>

                {mode === 'business' && (
                  <div className="healthy-tech" data-testid="x12-business-summary">
                    <div><FileText size={18} /><span><strong>204 Motor Carrier Load Tender</strong><small>FreightBridge created this partner-specific tender from the canonical shipment.</small></span></div>
                    <div><Server size={18} /><span><strong>Delivered to SFTP</strong><small>{text(preview?.remotePath ?? dispatch?.remotePath)}</small></span></div>
                    <div><Map size={18} /><span><strong>Not yet accepted</strong><small>No Midwest processing, 997, or 990 has happened in Part 2.</small></span></div>
                    <div><CheckCircle2 size={18} /><span><strong>Correlation ready</strong><small>Control numbers can be used by later acknowledgments.</small></span></div>
                  </div>
                )}

                {mode === 'segments' && (
                  <div className="segment-list" data-testid="x12-segment-explanation">
                    {segments.map((item, index) => (
                      <button
                        className={selectedRow.segmentId === item.segmentId ? 'active' : ''}
                        key={`${item.segmentId}-${index}`}
                        type="button"
                        onClick={() => selectRowForSegment(item.segmentId, setSelectedRowId)}
                      >
                        <strong>{item.segmentId}</strong>
                        <span>{segmentMeaning(item.segmentId)}</span>
                        <code>{item.raw}</code>
                      </button>
                    ))}
                  </div>
                )}

                {mode === 'raw' && <pre className="healthy-raw" data-testid="raw-x12-204">{rawX12}</pre>}
              </section>

              <section className="panel profile-evidence" data-testid="mapping-profile-evidence">
                <div className="panel-header"><div><p className="eyebrow">How was this generated?</p><h2>Profile, controls, and file evidence</h2></div></div>
                <div className="healthy-fields">
                  <div><span>Mapping key</span><strong>{text(preview?.mappingKey)}</strong></div>
                  <div><span>Profile ID</span><strong>{text(preview?.mappingProfileId)}</strong></div>
                  <div><span>Profile version</span><strong>{text(preview?.mappingProfileVersion)}</strong></div>
                  <div><span>ISA13</span><strong>{text(preview?.interchangeControlNumber)}</strong></div>
                  <div><span>GS06</span><strong>{text(preview?.groupControlNumber)}</strong></div>
                  <div><span>ST02</span><strong>{text(preview?.transactionControlNumber)}</strong></div>
                  <div><span>File name</span><strong>{text(preview?.fileName ?? dispatch?.fileName)}</strong></div>
                  <div><span>Remote path</span><strong>{text(preview?.remotePath ?? dispatch?.remotePath)}</strong></div>
                  <div><span>Payload hash</span><strong>{text(preview?.payloadSha256)}</strong></div>
                </div>
                <p className="muted-text">Mapping profile version tells support which transformation rules produced this message. Control numbers help correlate the outbound 204 with later technical acknowledgments. Remote path shows where FreightBridge placed the file; it does not prove Midwest accepted the tender.</p>
              </section>
            </>
          )}

          <section className="panel healthy-checks" data-testid="healthy-mapping-checks">
            <div className="panel-header"><div><p className="eyebrow">Knowledge checks</p><h2>Confirm the boundary</h2></div><span className="badge badge-info">{checksPassed ? 'Ready' : 'In progress'}</span></div>
            <div className="mapping-check-grid">
              {checks.map((check) => (
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
                      <p>{answers[check.id] === check.answer ? 'Correct.' : 'Not quite. Keep the 204 delivery separate from Midwest acceptance.'}</p>
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
          </section>

          <article className={`panel healthy-finish ${complete ? 'complete' : ''}`} data-testid="healthy-part2-completion">
            <div>
              <p className="eyebrow">Part 2 completion</p>
              <h2>204 generated and delivered, Midwest not processed yet</h2>
              <p>Complete this part only after the real 204 evidence exists and the knowledge checks are correct. The next healthy-flow part can resume this same run for Midwest processing.</p>
            </div>
            {!complete ? (
              <button className="primary-button" type="button" onClick={finish} disabled={!canComplete}>
                <CheckCircle2 size={16} />Complete Part 2
              </button>
            ) : (
              <div className="healthy-next">
                <CheckCircle2 size={18} />
                <span><strong>Part 2 complete.</strong><small>Saved run {saved.runId}; load {saved.loadId} preserved for Part 3.</small></span>
                <Link className="primary-button" to="/learn/healthy/acknowledgments">Continue to Part 3<ArrowRight size={16} /></Link>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}

function Pipeline({ dispatched }: { dispatched: boolean }) {
  const items = [
    ['Apex JSON', true],
    ['Canonical Shipment', true],
    ['Midwest Mapping', dispatched],
    ['X12 204 Generated', dispatched],
    ['Midwest inbound SFTP', dispatched],
    ['Midwest processed file', false],
  ] as const;
  return (
    <section className="healthy-pipeline" data-testid="healthy-mapping-pipeline" aria-label="Apex JSON to Midwest inbound SFTP pipeline">
      {items.map(([label, complete], index) => (
        <div className={complete ? 'complete' : index === 5 ? 'not-yet' : 'pending'} key={label}>
          {complete ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          <span>{label}</span>
          {index < items.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
        </div>
      ))}
    </section>
  );
}

function RecoveryState({ title, detail, runId }: { title: string; detail: string; runId?: string }) {
  return (
    <section className="healthy-guide" data-testid="healthy-mapping-recovery">
      <Link className="secondary-button training-back-link" to="/learn/desk"><ArrowLeft size={16} />Ops Desk</Link>
      <article className="panel training-alert" role="alert">
        <AlertTriangle size={20} />
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
          {runId && <p className="muted-text">Saved Lab run: {runId}</p>}
          <Link className="primary-button" to="/learn/healthy/apex-tender">Return to Part 1</Link>
        </div>
      </article>
    </section>
  );
}

function parseX12Segments(raw: string): X12SegmentView[] {
  return raw
    .split('~')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((rawSegment) => {
      const [segmentId, ...elements] = rawSegment.split('*');
      return { segmentId, elements, raw: `${rawSegment}~` };
    });
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Pending';
  return String(value);
}

function nestedText(record: Record<string, unknown>, path: string[]): string {
  let current: unknown = record;
  for (const item of path) {
    const next = asRecord(current);
    if (!next) return '';
    current = next[item];
  }
  return current ? String(current) : '';
}

function segment(segments: X12SegmentView[], segmentId: string): X12SegmentView | undefined {
  return segments.find((item) => item.segmentId === segmentId);
}

function segmentElement(segments: X12SegmentView[], segmentId: string, oneBasedElement: number): string {
  return segment(segments, segmentId)?.elements[oneBasedElement - 1] ?? 'Pending';
}

function qualifiedSegmentValue(segments: X12SegmentView[], segmentId: string, qualifier: string): string {
  const match = segments.find((item) => item.segmentId === segmentId && item.elements[1] === qualifier);
  return match?.elements[0] ?? 'Pending';
}

function qualifiedDateTime(segments: X12SegmentView[], qualifier: string): string {
  const match = segments.find((item) => item.segmentId === 'G62' && item.elements[0] === qualifier);
  if (!match) return 'Pending';
  return `${match.elements[1] ?? 'Pending'} ${match.elements[3] ?? ''}`.trim();
}

function stopLoopSummary(segments: X12SegmentView[], partyQualifier: 'SH' | 'CN'): string {
  const n1Index = segments.findIndex((item) => item.segmentId === 'N1' && item.elements[0] === partyQualifier);
  if (n1Index < 0) return 'Pending';
  const n1 = segments[n1Index];
  const n3 = segments.slice(n1Index + 1).find((item) => item.segmentId === 'N3');
  const n4 = segments.slice(n1Index + 1).find((item) => item.segmentId === 'N4');
  return [n1.elements[1], n3?.elements[0], [n4?.elements[0], n4?.elements[1], n4?.elements[2]].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' / ');
}

function referenceValue(shipment: Record<string, unknown>, type: string): string {
  const references = Array.isArray(shipment.references) ? shipment.references : [];
  const match = references
    .map((value) => asRecord(value))
    .find((value) => value?.referenceType === type || value?.type === type);
  return text(match?.referenceValue ?? match?.value);
}

function segmentMeaning(segmentId: string): string {
  const meanings: Record<string, string> = {
    ISA: 'Interchange envelope',
    GS: 'Functional group for 204 tender',
    ST: '204 transaction start',
    B2: 'Load tender beginning segment',
    L11: 'Shipment reference',
    G62: 'Appointment date/time',
    S5: 'Stop sequence',
    N1: 'Party name',
    N3: 'Street address',
    N4: 'City/state/postal',
    L3: 'Weight and pieces',
    SE: 'Transaction trailer',
    GE: 'Group trailer',
    IEA: 'Interchange trailer',
  };
  return meanings[segmentId] ?? 'Generated X12 segment';
}

function selectRowForSegment(segmentId: string, setSelectedRowId: (value: string) => void) {
  const row = mappingRows.find((candidate) => candidate.segmentId === segmentId);
  if (row) setSelectedRowId(row.id);
}

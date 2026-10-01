import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileCode2,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, recoverLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import { TrainingStoryTimeline, type TrainingStoryEvent } from '../components/training/TrainingStoryTimeline';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { IncidentMissionDefinition } from '../training/types';

type CodeFile = 'profile' | 'correlation' | 'fix';

export function FinalShiftPage({ mission }: { mission: IncidentMissionDefinition }) {
  const { token, handleApiError } = useOperationsSession();
  const alreadyComplete = hasCompletedMission(loadTrainingProgress(), mission.id);
  const [run, setRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [activeFile, setActiveFile] = useState<CodeFile>('profile');
  const [assessment, setAssessment] = useState('');
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [correctedReference, setCorrectedReference] = useState('');
  const [preserveProfileStatus, setPreserveProfileStatus] = useState(false);
  const [freshControls, setFreshControls] = useState(false);
  const [report, setReport] = useState('');
  const [completed, setCompleted] = useState(alreadyComplete);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failureDrill = useMemo(() => record(run?.resultSummary.failureDrill), [run]);
  const observed = record(failureDrill?.observed);
  const fault = record(failureDrill?.x12Fault);
  const payload = record(failureDrill?.payloadPreview);
  const x12 = stringValue(payload?.x12) ?? '';
  const intendedReference = stringValue(fault?.intendedShipmentReference) ?? run?.businessIdentifier ?? '';
  const receivedReference = stringValue(fault?.receivedShipmentReference) ?? segmentElement(x12, 'B10', 2) ?? '';
  const recovery = record(recoveryRun?.resultSummary.recovery);

  const assessmentAccepted = assessmentSubmitted && finalAssessmentIsCorrect(assessment);
  const fixReady = Boolean(
    intendedReference
      && correctedReference.trim() === intendedReference
      && preserveProfileStatus
      && freshControls,
  );
  const verified = Boolean(
    run
      && recoveryRun
      && recoveryRun.businessIdentifier === run.businessIdentifier
      && recovery?.status === 'SUCCEEDED'
      && recovery?.recoveryKind === 'CORRECTED_214_REFERENCE'
      && recovery?.sameBusinessIdentifier === true
      && recovery?.correctedShipmentReference === intendedReference
      && recovery?.normalizedShipmentStatus === 'PICKED_UP'
      && recovery?.apexFacingEvidence === true,
  );
  const reportReady = verified && finalReportIsComplete(report);

  async function startShift() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setRun(null);
    setRecoveryRun(null);
    setActiveFile('profile');
    setAssessment('');
    setAssessmentSubmitted(false);
    setCorrectedReference('');
    setPreserveProfileStatus(false);
    setFreshControls(false);
    setReport('');
    setCompleted(false);

    try {
      let nextRun = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: ('FINAL' + Date.now().toString(36).toUpperCase()).slice(0, 30),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Final Shift Production Incident Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 12) {
        const result = await runNextLabStep(token, nextRun.id);
        nextRun = result.run;
        guard += 1;
      }
      if (nextRun.status !== 'SUCCEEDED') {
        throw new Error('The final-shift incident did not produce its expected FreightBridge evidence.');
      }

      const drill = record(nextRun.resultSummary.failureDrill);
      const drillFault = record(drill?.x12Fault);
      const drillPayload = record(drill?.payloadPreview);
      const raw214 = stringValue(drillPayload?.x12) ?? '';
      const badReference = stringValue(drillFault?.receivedShipmentReference)
        ?? segmentElement(raw214, 'B10', 2)
        ?? '';

      setRun(nextRun);
      setCorrectedReference(badReference);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The final-shift incident could not be started.');
    } finally {
      setWorking(false);
    }
  }

  function submitAssessment() {
    setAssessmentSubmitted(true);
  }

  async function verifyCorrection() {
    if (!token || !run || !assessmentAccepted || !fixReady) return;
    setWorking(true);
    setError(null);
    setRecoveryRun(null);

    try {
      const recovered = await recoverLabRun(token, run.id);
      setRecoveryRun(recovered);
      const proof = record(recovered.resultSummary.recovery);
      const okay = Boolean(
        recovered.businessIdentifier === run.businessIdentifier
          && proof?.status === 'SUCCEEDED'
          && proof?.recoveryKind === 'CORRECTED_214_REFERENCE'
          && proof?.sameBusinessIdentifier === true
          && proof?.correctedShipmentReference === intendedReference
          && proof?.normalizedShipmentStatus === 'PICKED_UP'
          && proof?.apexFacingEvidence === true,
      );
      if (!okay) {
        setError('Recovery ran, but the evidence did not prove the corrected shipment reference reached the Apex-facing PICKED_UP outcome.');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Final-shift recovery could not be verified.');
    } finally {
      setWorking(false);
    }
  }

  function completeShift() {
    if (!reportReady) return;
    completeMission(mission.id);
    setCompleted(true);
  }

  if (!run) {
    return (
      <section className="workstation-case-start final-shift-start" data-testid="incident-mission-page">
        <Link className="secondary-button training-back-link" to="/learn/desk">
          <ArrowLeft size={16} /> Training Desk
        </Link>

        <article className="panel workstation-case-brief final-shift-ticket" data-testid="final-shift-page">
          <div>
            <p className="eyebrow">Module 07 · Final Shift · Mission 10</p>
            <h1>Production status incident</h1>
            <p>
              Midwest says its pickup status was sent successfully, but Apex still has no update.
              Work the incident from FreightBridge evidence, make the controlled correction, prove
              the customer-facing recovery, and close the shift with a production-style update.
            </p>
          </div>

          <div className="final-shift-ticket-grid">
            <div>
              <span>Partner report</span>
              <strong>Midwest: “We sent a valid pickup 214 using the agreed 004010 profile.”</strong>
            </div>
            <div>
              <span>Customer impact</span>
              <strong>Apex still does not show the pickup status for the intended shipment.</strong>
            </div>
            <div>
              <span>Your responsibility</span>
              <strong>Prove the stop point, correct only what the evidence supports, and verify the Apex-facing outcome.</strong>
            </div>
          </div>

          <div className="final-shift-expectation">
            <ShieldCheck size={18} />
            <span>No checkpoint classifier, required evidence order, diagnosis choices, or hint ladder is provided.</span>
          </div>

          <div className="lab-actions">
            <button className="primary-button" type="button" onClick={startShift} disabled={working}>
              <Play size={16} /> {working ? 'Opening incident…' : alreadyComplete ? 'Replay Final Shift' : 'Start Final Shift'}
            </button>
            <Link className="secondary-button" to="/learn/practice/independent-investigation">Review Independent Investigation</Link>
          </div>
        </article>

        {error && <FinalShiftError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="incident-mission-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>

      <p className="sr-only">Mission 10 - Final Shift Incident</p>

      {error && <FinalShiftError message={error} />}

      <div data-testid="final-shift-workstation" data-scenario-key={mission.scenarioKey}>
        <LabWorkstation
          caseLabel="Module 07 · Final Shift · Mission 10"
          title="Midwest pickup status missing at Apex"
          subtitle="Choose your own evidence path, write the diagnosis, make the controlled B10 correction, and prove the real recovery."
          statusLabel={verified ? 'Recovery verified' : assessmentAccepted ? 'Correction required' : 'Production incident open'}
          statusTone={verified ? 'success' : 'danger'}
          console={
            <FinalShiftConsole
            run={run}
            observed={observed}
            fault={fault}
            x12={x12}
            intendedReference={intendedReference}
            receivedReference={receivedReference}
          />
          }
          code={
            <FinalShiftCode
              activeFile={activeFile}
              intendedReference={intendedReference}
              receivedReference={receivedReference}
              x12={x12}
              correctedReference={correctedReference}
              preserveProfileStatus={preserveProfileStatus}
              freshControls={freshControls}
              fixReady={fixReady}
              onFile={setActiveFile}
              onCorrectedReference={setCorrectedReference}
              onPreserveProfileStatus={setPreserveProfileStatus}
              onFreshControls={setFreshControls}
            />
          }
          answer={
            <FinalShiftAnswer
              assessment={assessment}
              assessmentSubmitted={assessmentSubmitted}
              assessmentAccepted={assessmentAccepted}
              fixReady={fixReady}
              verified={verified}
              recovery={recovery}
              report={report}
              reportReady={reportReady}
              working={working}
              completed={completed}
              onAssessment={(value) => {
                setAssessment(value);
                setAssessmentSubmitted(false);
              }}
              onSubmitAssessment={submitAssessment}
              onVerify={verifyCorrection}
              onReport={setReport}
              onComplete={completeShift}
            />
          }
        />
      </div>

      {completed && (
        <article className="panel workstation-complete final-shift-complete" data-testid="final-shift-completion">
          <CheckCircle2 size={26} />
          <div>
            <p className="eyebrow">MISSION COMPLETE · TRAINING COMPLETE</p>
            <h2>You closed the Final Shift.</h2>
            <p>
              You proved a technically valid 214 could still fail business correlation, corrected the wrong shipment reference
              without weakening validation, and verified the Apex-facing PICKED_UP result.
            </p>
          </div>
          <div className="workstation-complete-actions">
            <Link className="primary-button" to="/learn/desk">Return to Training Desk</Link>
            <Link className="secondary-button" to="/dashboard">Open Advanced Console</Link>
          </div>
        </article>
      )}
    </section>
  );
}

function FinalShiftConsole({
  run,
  observed,
  fault,
  x12,
  intendedReference,
  receivedReference,
}: {
  run: LabRun;
  observed: Record<string, unknown> | null;
  fault: Record<string, unknown> | null;
  x12: string;
  intendedReference: string;
  receivedReference: string;
}) {
  const events: TrainingStoryEvent[] = [
    {
      id: 'raw-214',
      title: 'Raw 214',
      from: 'Midwest Carrier',
      to: 'FreightBridge SFTP Intake',
      document: 'X12 214 · shipment status',
      status: 'RECEIVED',
      tone: 'success',
      summary: 'A Midwest 214 reached FreightBridge. Inspect the message itself before deciding where processing failed.',
      logLines: [x12 || 'Raw 214 unavailable.'],
    },
    {
      id: 'controls',
      title: 'X12 Controls',
      from: 'FreightBridge SFTP Intake',
      to: 'X12 Parser',
      document: 'ISA / GS / ST / SE validation',
      status: 'PASSED',
      tone: 'success',
      summary: 'FreightBridge parsed the envelope and transaction controls successfully.',
      logLines: [
        'ISA12=' + String(segmentElement(x12, 'ISA', 12)),
        'GS08=' + String(segmentElement(x12, 'GS', 8)),
        'ST02=' + String(segmentElement(x12, 'ST', 2)),
        'SE02=' + String(segmentElement(x12, 'SE', 2)),
        'AT7-01=' + String(segmentElement(x12, 'AT7', 1)),
        'parse_result=PASS',
      ],
    },
    {
      id: 'mapping',
      title: '214 status mapping',
      from: 'X12 Parser',
      to: 'Midwest 214 Mapper',
      document: 'AT7 status normalization',
      status: 'PASSED',
      tone: 'success',
      summary: 'The parsed status code is accepted by the active Midwest mapping profile.',
      logLines: [
        'partner=MIDWEST',
        'AT7-01=' + String(segmentElement(x12, 'AT7', 1)),
        'normalized_status=PICKED_UP',
        'mapping_result=PASS',
      ],
    },
    {
      id: 'correlation',
      title: 'Shipment Correlation',
      from: 'Midwest 214 Mapper',
      to: 'Canonical Shipment Lookup',
      document: 'B10 shipment-reference correlation',
      status: 'FAILED',
      tone: 'blocked',
      summary: 'The technically valid 214 reached business correlation. Compare the intended shipment with the B10 reference FreightBridge received.',
      logLines: [
        'intended_shipment_reference=' + intendedReference,
        'received_B10_shipment_reference=' + receivedReference,
        'interchange_control_number=' + String(fault?.interchangeControlNumber ?? null),
        'group_control_number=' + String(fault?.groupControlNumber ?? null),
        'transaction_control_number=' + String(fault?.transactionControlNumber ?? null),
        'lookup_result=NO_MATCH',
      ],
    },
    {
      id: 'failure',
      title: 'Persisted Failure',
      from: 'Canonical Shipment Lookup',
      to: 'FreightBridge Error Store',
      document: 'Integration failure record',
      status: 'FAILED',
      tone: 'blocked',
      summary: 'FreightBridge persisted the first failing business-stage evidence. Use it together with the raw 214 and correlation data.',
      logLines: [
        'error_code=' + String(observed?.errorCode ?? null),
        'category=' + String(observed?.category ?? null),
        'stage=' + String(observed?.stage ?? null),
        'safe_message=' + String(observed?.safeMessage ?? null),
        'business_identifier=' + String(observed?.businessIdentifier ?? null),
        'transaction_id=' + String(observed?.transactionId ?? null),
      ],
    },
  ];

  return (
    <TrainingStoryTimeline
      identifier={run.businessIdentifier}
      events={events}
      scenarioTitle="Midwest says a valid pickup 214 was sent, but Apex never received the status."
      scenarioBody="This is the Final Shift. Follow only FreightBridge-visible evidence from file arrival through parsing, mapping, shipment correlation, and the persisted failure."
      guidance="No evidence item is required and no inspection order is enforced. The timeline tells you what happened; your diagnosis still has to explain why."
      testId="final-shift-console"
      viewerTestId="final-shift-evidence-viewer"
    >
      <div className="final-shift-no-hints">
        <Circle size={15} />
        <span>No evidence item is required and no inspection order is enforced. Your diagnosis is graded on the conclusion you submit.</span>
      </div>
    </TrainingStoryTimeline>
  );
}

function FinalShiftCode({
  activeFile,
  intendedReference,
  receivedReference,
  x12,
  correctedReference,
  preserveProfileStatus,
  freshControls,
  fixReady,
  onFile,
  onCorrectedReference,
  onPreserveProfileStatus,
  onFreshControls,
}: {
  activeFile: CodeFile;
  intendedReference: string;
  receivedReference: string;
  x12: string;
  correctedReference: string;
  preserveProfileStatus: boolean;
  freshControls: boolean;
  fixReady: boolean;
  onFile: (value: CodeFile) => void;
  onCorrectedReference: (value: string) => void;
  onPreserveProfileStatus: (value: boolean) => void;
  onFreshControls: (value: boolean) => void;
}) {
  const files: Array<{ id: CodeFile; path: string }> = [
    { id: 'profile', path: 'Partner Contracts/midwest_214.profile.json' },
    { id: 'correlation', path: 'Processing/shipment_correlation.ts' },
    { id: 'fix', path: 'Fix/final_shift_214.training.json' },
  ];

  return (
    <div className="workstation-code advanced-workstation-code final-shift-code" data-testid="final-shift-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading">
          <div><span>Workspace</span><strong>Production incident files</strong></div>
        </div>
        <div className="workstation-file-list">
          {files.map((file) => (
            <button key={file.id} className={activeFile === file.id ? 'active' : ''} type="button" onClick={() => onFile(file.id)}>
              <FileCode2 size={14} /><span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workstation-editor">
        <div className="workstation-editor-bar">
          <span>{files.find((file) => file.id === activeFile)?.path}</span>
          <small>{activeFile === 'fix' ? 'Editable training control' : 'Read only'}</small>
        </div>

        {activeFile === 'profile' && (
          <pre data-testid="final-shift-code-content"><code>{JSON.stringify({
            isa12: '00401',
            gs08: '004010',
            statusMap: { AF: 'PICKED_UP', X6: 'IN_TRANSIT', X1: 'ARRIVED', D1: 'DELIVERED' },
            shipmentReferenceElement: 'B10-02',
            receivedIsa12: segmentElement(x12, 'ISA', 12),
            receivedGs08: segmentElement(x12, 'GS', 8),
            receivedAt701: segmentElement(x12, 'AT7', 1),
          }, null, 2)}</code></pre>
        )}

        {activeFile === 'correlation' && (
          <pre data-testid="final-shift-code-content"><code>{[
            'shipmentReference = parsed214.B10_02',
            'shipment = findCanonicalShipment(shipmentReference)',
            '',
            'if (!shipment) {',
            "  throw SHIPMENT_NOT_FOUND('BUSINESS_VALIDATION')",
            '}',
            '',
            'persistMappedShipmentEvent(shipment, parsed214.status)',
          ].join('\n')}</code></pre>
        )}

        {activeFile === 'fix' && (
          <div className="advanced-edit-form" data-testid="final-shift-fix-editor">
            <label>
              <span>B10 shipment reference</span>
              <input
                aria-label="B10 shipment reference"
                value={correctedReference}
                onChange={(event) => onCorrectedReference(event.target.value)}
              />
              <small>Observed value: {receivedReference || 'Unavailable'}. Correct only after you prove the intended shipment from FreightBridge evidence.</small>
            </label>

            <label className="advanced-checkbox">
              <input
                type="checkbox"
                checked={preserveProfileStatus}
                onChange={(event) => onPreserveProfileStatus(event.target.checked)}
              />
              <span>Keep the supported Midwest 004010 profile and AF → PICKED_UP mapping unchanged</span>
            </label>

            <label className="advanced-checkbox">
              <input
                type="checkbox"
                checked={freshControls}
                onChange={(event) => onFreshControls(event.target.checked)}
              />
              <span>Generate fresh ST02 / SE02 transaction controls for the corrected resubmission</span>
            </label>

            <pre><code>{JSON.stringify({
              intendedShipmentReference: intendedReference || '(inspect evidence)',
              correctedB10ShipmentReference: correctedReference || '(not set)',
              preserveProfileStatus,
              freshTransactionControls: freshControls,
            }, null, 2)}</code></pre>

            <div className={'advanced-edit-status ' + (fixReady ? 'ready' : '')}>
              {fixReady
                ? 'Controlled 214 correction is ready for server-backed verification.'
                : 'The corrected 214 is not yet safe to verify.'}
            </div>
          </div>
        )}
      </section>

      <aside className="workstation-code-note">
        <ShieldCheck size={19} />
        <strong>Change the smallest thing supported by evidence</strong>
        <p>The final shift should not “fix” a healthy X12 profile or supported AF mapping when the failure is elsewhere.</p>
      </aside>
    </div>
  );
}

function FinalShiftAnswer({
  assessment,
  assessmentSubmitted,
  assessmentAccepted,
  fixReady,
  verified,
  recovery,
  report,
  reportReady,
  working,
  completed,
  onAssessment,
  onSubmitAssessment,
  onVerify,
  onReport,
  onComplete,
}: {
  assessment: string;
  assessmentSubmitted: boolean;
  assessmentAccepted: boolean;
  fixReady: boolean;
  verified: boolean;
  recovery: Record<string, unknown> | null;
  report: string;
  reportReady: boolean;
  working: boolean;
  completed: boolean;
  onAssessment: (value: string) => void;
  onSubmitAssessment: () => void;
  onVerify: () => void;
  onReport: (value: string) => void;
  onComplete: () => void;
}) {
  return (
    <div className="workstation-answer final-shift-answer" data-testid="final-shift-answer">
      <div className="workstation-answer-heading">
        <div>
          <span>Final incident response</span>
          <strong>State the root cause before changing production-facing behavior.</strong>
        </div>
      </div>

      <label className="final-shift-assessment">
        <span>Production incident assessment</span>
        <textarea
          value={assessment}
          onChange={(event) => onAssessment(event.target.value)}
          placeholder="Explain the failing business element, the FreightBridge processing boundary, and why the technically valid 214 still could not update the intended shipment."
        />
      </label>

      <button className="secondary-button" type="button" onClick={onSubmitAssessment} disabled={assessment.trim().length < 40}>
        Submit Assessment
      </button>

      {assessmentSubmitted && (
        <div className={'independent-diagnosis-result ' + (assessmentAccepted ? 'accepted' : '')} data-testid="final-shift-assessment-result">
          {assessmentAccepted
            ? 'Assessment accepted. Make the smallest evidence-supported correction in Code, then verify it.'
            : 'The assessment is not specific enough yet. Identify the shipment-reference correlation problem and the FreightBridge processing boundary where it failed.'}
        </div>
      )}

      <div className={'advanced-fix-readiness ' + (assessmentAccepted && fixReady ? 'ready' : '')}>
        {assessmentAccepted && fixReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <div>
          <strong>{assessmentAccepted && fixReady ? 'Correction ready' : 'Correction not ready'}</strong>
          <p>
            {assessmentAccepted && fixReady
              ? 'Your diagnosis and controlled B10 correction are ready for real server-backed recovery.'
              : 'The final shift requires an accepted written assessment and a safe Code correction before recovery can run.'}
          </p>
        </div>
      </div>

      <button className="primary-button" type="button" onClick={onVerify} disabled={!assessmentAccepted || !fixReady || working || verified}>
        {working ? 'Verifying correction…' : verified ? 'Recovery Verified' : 'Apply Correction & Verify'}
      </button>

      <article className={'guided-verification ' + (verified ? 'verified' : '')} data-testid="final-shift-verification">
        <div>
          {verified ? <CheckCircle2 size={19} /> : <Circle size={19} />}
          <div>
            <strong>{verified ? 'Server-backed recovery verified' : 'Recovery evidence pending'}</strong>
            <p>Completion requires the corrected shipment reference and an Apex-facing PICKED_UP result.</p>
          </div>
        </div>
        {recovery && (
          <dl>
            <div><dt>Recovery Action</dt><dd>{String(recovery.recoveryKind ?? 'Unknown')}</dd></div>
            <div><dt>Corrected Shipment Reference</dt><dd>{String(recovery.correctedShipmentReference ?? 'Pending')}</dd></div>
            <div><dt>Corrected ISA12</dt><dd>{String(recovery.correctedIsa12 ?? 'Pending')}</dd></div>
            <div><dt>Corrected GS08</dt><dd>{String(recovery.correctedGs08 ?? 'Pending')}</dd></div>
            <div><dt>Corrected AT7-01</dt><dd>{String(recovery.correctedAt7 ?? 'Pending')}</dd></div>
            <div><dt>Shipment Status</dt><dd>{String(recovery.normalizedShipmentStatus ?? 'Pending')}</dd></div>
            <div><dt>Apex-Facing Evidence</dt><dd>{recovery.apexFacingEvidence === true ? 'PRESENT' : 'MISSING'}</dd></div>
            <div><dt>Same Business Identifier</dt><dd>{recovery.sameBusinessIdentifier === true ? 'YES' : 'NO'}</dd></div>
          </dl>
        )}
      </article>

      <label className="guided-status-update final-shift-report">
        <span>Final incident update to Mike</span>
        <textarea
          value={report}
          onChange={(event) => onReport(event.target.value)}
          disabled={!verified}
          placeholder="Summarize the partner claim, FreightBridge evidence, root cause, correction, and verified Apex-facing outcome."
        />
        <small>{verified ? 'Close the incident like a production support analyst.' : 'Verify recovery before writing the final update.'}</small>
      </label>

      <button className="primary-button" type="button" onClick={onComplete} disabled={!reportReady || completed}>
        {completed ? 'Final Shift Complete' : 'Complete Final Shift'}
      </button>
    </div>
  );
}

function FinalShiftError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div><h2>Final Shift hit an unexpected system failure.</h2><p>{message}</p></div>
    </article>
  );
}

function finalAssessmentIsCorrect(value: string): boolean {
  const text = value.trim().toLowerCase();
  const identifiesReference = text.includes('b10') || text.includes('shipment reference');
  const identifiesBoundary = text.includes('business validation') || text.includes('business correlation') || text.includes('correlation');
  const identifiesMismatch = ['wrong', 'unknown', 'mismatch', 'does not match', "doesn't match", 'incorrect'].some((token) => text.includes(token));
  return text.length >= 60 && identifiesReference && identifiesBoundary && identifiesMismatch;
}

function finalReportIsComplete(value: string): boolean {
  const text = value.trim().toLowerCase();
  const referencesRootCause = text.includes('b10') || text.includes('shipment reference');
  const referencesOutcome = text.includes('picked_up') || text.includes('picked up') || text.includes('pickup');
  const referencesCustomer = text.includes('apex');
  return text.length >= 100 && referencesRootCause && referencesOutcome && referencesCustomer;
}

function segmentElement(x12: string, segmentId: string, elementIndex: number): string | null {
  if (!x12) return null;
  const segment = x12.split('~').find((candidate) => candidate.startsWith(segmentId + '*'));
  if (!segment) return null;
  return segment.split('*')[elementIndex] ?? null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}


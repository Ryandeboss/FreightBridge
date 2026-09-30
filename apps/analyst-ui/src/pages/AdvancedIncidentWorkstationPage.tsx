import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode2,
  FileJson2,
  Play,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createLabRun, recoverLabRun, runNextLabStep, type LabRun } from '../api/lab';
import { useOperationsSession } from '../auth/OperationsSession';
import { LabWorkstation } from '../components/training/LabWorkstation';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';
import type { IncidentEvidencePoint, IncidentEvidenceSource, IncidentMissionDefinition, IncidentOption } from '../training/types';

type DetailMode = 'processing' | 'raw';

type VersionDraft = {
  isa12: string;
  gs08: string;
};

type SftpDraft = {
  hostKeyMode: string;
  replayBusinessMessage: boolean;
};

const VERSION_OPTIONS = ['00501', '00401'];
const GROUP_VERSION_OPTIONS = ['005010', '004010'];

export function AdvancedIncidentWorkstation({ mission }: { mission: IncidentMissionDefinition }) {
  const { token, handleApiError } = useOperationsSession();
  const alreadyCompleted = hasCompletedMission(loadTrainingProgress(), mission.id);
  const [incidentRun, setIncidentRun] = useState<LabRun | null>(null);
  const [recoveryRun, setRecoveryRun] = useState<LabRun | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(mission.evidencePoints[0]?.id ?? '');
  const [detailMode, setDetailMode] = useState<DetailMode>('processing');
  const [inspectedEvidenceIds, setInspectedEvidenceIds] = useState<string[]>([]);
  const [lastHealthyId, setLastHealthyId] = useState<string | null>(null);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState<VersionDraft>({ isa12: '00501', gs08: '005010' });
  const [sftpDraft, setSftpDraft] = useState<SftpDraft>({
    hostKeyMode: 'temporary-invalid-fingerprint',
    replayBusinessMessage: false,
  });
  const [activeFileId, setActiveFileId] = useState('received');
  const [statusUpdate, setStatusUpdate] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const failureDrill = useMemo(() => record(incidentRun?.resultSummary.failureDrill), [incidentRun]);
  const observed = record(failureDrill?.observed);
  const payloadPreview = record(failureDrill?.payloadPreview);
  const recovery = record(recoveryRun?.resultSummary.recovery);
  const selectedEvidence =
    mission.evidencePoints.find((point) => point.id === selectedEvidenceId) ?? mission.evidencePoints[0];

  const requiredEvidenceInspected = (mission.requiredEvidenceSourceIds ?? [])
    .every((id) => inspectedEvidenceIds.includes(id));
  const lastHealthyCorrect = lastHealthyId === mission.correctLastHealthyId;
  const diagnosisCorrect = diagnosisId === mission.correctDiagnosisId;
  const fixReady = mission.scenarioKey === 'X12_214_WRONG_VERSION'
    ? versionDraft.isa12 === '00401' && versionDraft.gs08 === '004010'
    : sftpDraft.hostKeyMode === 'verified-configured-fingerprint' && sftpDraft.replayBusinessMessage === false;
  const verified = verifyRecovery(mission, incidentRun, recoveryRun, recovery);
  const canRunFix = requiredEvidenceInspected && lastHealthyCorrect && diagnosisCorrect && fixReady;
  const canComplete = verified && statusUpdate.trim().length >= 40;

  async function startIncident() {
    if (!token) return;
    setWorking(true);
    setError(null);
    setRecoveryRun(null);
    setInspectedEvidenceIds([]);
    setLastHealthyId(null);
    setDiagnosisId(null);
    setStatusUpdate('');
    setCompleted(false);
    setSelectedEvidenceId(mission.evidencePoints[0]?.id ?? '');
    setDetailMode('processing');
    setActiveFileId('received');
    setVersionDraft({ isa12: '00501', gs08: '005010' });
    setSftpDraft({ hostKeyMode: 'temporary-invalid-fingerprint', replayBusinessMessage: false });

    try {
      let nextRun = await createLabRun(token, {
        scenarioKey: mission.scenarioKey,
        loadId: ('ADV' + mission.missionNumber + Date.now().toString(36).toUpperCase()).slice(0, 30),
        equipmentType: 'VAN_53',
        weightLbs: 42000,
        pieces: 22,
        commodityDescription: 'Advanced Incident Training Freight',
      });
      let guard = 0;
      while (nextRun.status !== 'SUCCEEDED' && nextRun.status !== 'FAILED' && guard < 12) {
        const result = await runNextLabStep(token, nextRun.id);
        nextRun = result.run;
        guard += 1;
      }
      if (nextRun.status !== 'SUCCEEDED') {
        throw new Error('Controlled advanced incident did not reach its expected observed-failure result.');
      }
      setIncidentRun(nextRun);
      const failed = mission.evidencePoints.find((point) => point.status === 'FAILED');
      if (failed) setSelectedEvidenceId(failed.id);
      const preview = record(record(nextRun.resultSummary.failureDrill)?.payloadPreview);
      if (mission.scenarioKey === 'X12_214_WRONG_VERSION') {
        setVersionDraft({
          isa12: stringValue(preview?.isa12, '00501'),
          gs08: stringValue(preview?.gs08, '005010'),
        });
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The advanced incident could not be started.');
    } finally {
      setWorking(false);
    }
  }

  async function applyFix() {
    if (!token || !incidentRun || !canRunFix) return;
    setWorking(true);
    setError(null);
    try {
      const nextRun = await recoverLabRun(token, incidentRun.id);
      setRecoveryRun(nextRun);
      if (!verifyRecovery(mission, incidentRun, nextRun, record(nextRun.resultSummary.recovery))) {
        setError('Recovery ran, but the expected verification evidence is incomplete.');
      }
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'The advanced fix could not be verified.');
    } finally {
      setWorking(false);
    }
  }

  function finishMission() {
    if (!canComplete) return;
    completeMission(mission.id);
    setCompleted(true);
  }

  if (!incidentRun) {
    return (
      <section className="workstation-case-start" data-testid="incident-mission-page">
        <Link className="secondary-button training-back-link" to="/learn/desk">
          <ArrowLeft size={16} /> Training Desk
        </Link>
        <article className="panel workstation-case-brief">
          <div>
            <p className="eyebrow">Mission {mission.missionNumber} · Advanced incident</p>
            <h1>{mission.title.replace(/^Mission \d+ - /, '')}</h1>
            <p>{mission.symptom}</p>
          </div>
          <div className="workstation-brief-messages">
            <div><span>Manager briefing</span><p>{mission.briefing.body}</p></div>
            <div><span>Partner report</span><p>{mission.partnerMessage.body}</p></div>
          </div>
          <div className="advanced-incident-expectation">
            <ShieldCheck size={18} />
            <span>In this module, diagnosis is not enough. You must change the controlled configuration in Code and then verify the result.</span>
          </div>
          {alreadyCompleted && (
            <div className="workstation-prior-complete">
              <CheckCircle2 size={18} />
              Your previous completion is preserved. Replay the incident to practice the interactive fix.
            </div>
          )}
          <button className="primary-button" type="button" onClick={startIncident} disabled={working}>
            <Play size={16} /> {working ? 'Starting incident…' : alreadyCompleted ? 'Replay Advanced Incident' : 'Start Incident'}
          </button>
        </article>
        {error && <WorkstationError message={error} />}
      </section>
    );
  }

  return (
    <section className="workstation-case-page" data-testid="incident-mission-page">
      <Link className="secondary-button training-back-link" to="/learn/desk">
        <ArrowLeft size={16} /> Training Desk
      </Link>
      {error && <WorkstationError message={error} />}

      <div data-testid="incident-workspace" data-scenario-key={mission.scenarioKey}>
        <LabWorkstation
          caseLabel={'Mission ' + mission.missionNumber + ' · Advanced incident'}
          title={mission.title.replace(/^Mission \d+ - /, '')}
          subtitle="Inspect the evidence, identify the failure boundary, edit the controlled configuration, and prove recovery."
          statusLabel={verified ? 'Recovery verified' : 'Fix required'}
          console={
            <AdvancedConsole
              mission={mission}
              run={incidentRun}
              failureDrill={failureDrill}
              observed={observed}
              payloadPreview={payloadPreview}
              selectedEvidence={selectedEvidence}
              selectedEvidenceId={selectedEvidenceId}
              detailMode={detailMode}
              inspectedEvidenceIds={inspectedEvidenceIds}
              onSelectEvidence={(id) => {
                setSelectedEvidenceId(id);
                setDetailMode('processing');
              }}
              onDetailMode={setDetailMode}
              onInspectSource={(id) => setInspectedEvidenceIds((current) => current.includes(id) ? current : [...current, id])}
            />
          }
          code={
            <AdvancedCode
              mission={mission}
              payloadPreview={payloadPreview}
              activeFileId={activeFileId}
              versionDraft={versionDraft}
              sftpDraft={sftpDraft}
              onActiveFile={setActiveFileId}
              onVersionDraft={setVersionDraft}
              onSftpDraft={setSftpDraft}
            />
          }
          answer={
            <AdvancedAnswer
              mission={mission}
              lastHealthyId={lastHealthyId}
              diagnosisId={diagnosisId}
              requiredEvidenceInspected={requiredEvidenceInspected}
              fixReady={fixReady}
              recoveryRun={recoveryRun}
              recovery={recovery}
              verified={verified}
              statusUpdate={statusUpdate}
              working={working}
              completed={completed}
              onLastHealthy={setLastHealthyId}
              onDiagnosis={setDiagnosisId}
              onApplyFix={applyFix}
              onStatusUpdate={setStatusUpdate}
              onComplete={finishMission}
            />
          }
        />
      </div>

      {completed && (
        <>
          <article className="panel workstation-complete" data-testid="incident-summary">
            <CheckCircle2 size={24} />
            <div>
              <p className="eyebrow">Advanced incident complete</p>
              <h2>{mission.shortTitle} recovered.</h2>
              <p>You diagnosed the failure, changed the controlled configuration, and verified the recovery from FreightBridge evidence.</p>
            </div>
            <Link className="primary-button" to="/learn/desk">
              Return to Training Desk <ArrowRight size={16} />
            </Link>
          </article>
          <article className="panel guided-incident-debrief" data-testid="incident-debrief">
            <p className="eyebrow">MISSION COMPLETE</p>
            <h2>What to remember</h2>
            {mission.debrief.map((item) => <p key={item}>{item}</p>)}
          </article>
        </>
      )}
    </section>
  );
}

function AdvancedConsole({
  mission,
  run,
  failureDrill,
  observed,
  payloadPreview,
  selectedEvidence,
  selectedEvidenceId,
  detailMode,
  inspectedEvidenceIds,
  onSelectEvidence,
  onDetailMode,
  onInspectSource,
}: {
  mission: IncidentMissionDefinition;
  run: LabRun;
  failureDrill: Record<string, unknown> | null;
  observed: Record<string, unknown> | null;
  payloadPreview: Record<string, unknown> | null;
  selectedEvidence: IncidentEvidencePoint | undefined;
  selectedEvidenceId: string;
  detailMode: DetailMode;
  inspectedEvidenceIds: string[];
  onSelectEvidence: (id: string) => void;
  onDetailMode: (mode: DetailMode) => void;
  onInspectSource: (id: string) => void;
}) {
  const failed = mission.evidencePoints.find((point) => point.status === 'FAILED');
  return (
    <div className="workstation-console guided-workstation-console" data-testid="advanced-workstation-console">
      <section className="workstation-console-stream">
        <div className="workstation-pane-heading">
          <div><span>FreightBridge evidence</span><strong>{mission.scenarioKey === 'SFTP_HOST_KEY_MISMATCH' ? 'Pre-transaction transport probe' : run.businessIdentifier}</strong></div>
          <small>Find the first failed boundary before changing configuration.</small>
        </div>
        <div className="workstation-log-list">
          {mission.evidencePoints.map((point, index) => (
            <button
              key={point.id}
              className={'workstation-log-row ' + point.status.toLowerCase().replace('_', '-') + (point.id === selectedEvidenceId ? ' selected' : '')}
              type="button"
              onClick={() => onSelectEvidence(point.id)}
              data-testid={'advanced-log-' + point.id}
            >
              <span className="workstation-log-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="workstation-log-icon">{statusIcon(point.status)}</span>
              <span className="workstation-log-copy"><strong>{point.checkpoint}</strong><small>{point.source}</small></span>
              <span className="workstation-log-status">{point.status === 'NOT_REACHED' ? 'NOT REACHED' : point.status}</span>
            </button>
          ))}
        </div>
        <div className="workstation-stop-banner">
          <XCircle size={17} />
          <span>Processing stopped at <strong>{failed?.checkpoint}</strong>. Do not “fix” a later layer that was never reached.</span>
        </div>

        <div className="guided-evidence-sources">
          <div className="workstation-pane-heading">
            <div><span>Evidence set</span><strong>Inspect the required sources</strong></div>
          </div>
          {mission.evidenceSources?.map((source) => (
            <AdvancedEvidenceSource
              key={source.id}
              source={source}
              run={run}
              failureDrill={failureDrill}
              inspected={inspectedEvidenceIds.includes(source.id)}
              onInspect={() => onInspectSource(source.id)}
            />
          ))}
        </div>
      </section>

      <aside className="workstation-inspector">
        <div className="workstation-pane-heading">
          <div><span>Selected checkpoint</span><strong>{selectedEvidence?.checkpoint ?? 'Choose evidence'}</strong></div>
        </div>
        {selectedEvidence && (
          <>
            <dl className="workstation-inspector-grid">
              <div><dt>Status</dt><dd>{selectedEvidence.status}</dd></div>
              <div><dt>Source</dt><dd>{selectedEvidence.source}</dd></div>
              <div><dt>Error code</dt><dd>{selectedEvidence.status === 'FAILED' ? String(observed?.errorCode ?? '—') : '—'}</dd></div>
              <div><dt>Stage</dt><dd>{selectedEvidence.status === 'FAILED' ? String(observed?.stage ?? '—') : '—'}</dd></div>
            </dl>
            <div className="workstation-detail-toggle" role="group" aria-label="Selected evidence detail">
              <button className={detailMode === 'processing' ? 'active' : ''} type="button" onClick={() => onDetailMode('processing')}>
                View Processing Details
              </button>
              <button className={detailMode === 'raw' ? 'active' : ''} type="button" onClick={() => onDetailMode('raw')}>
                View Raw Message
              </button>
            </div>
            {detailMode === 'processing' ? (
              <div className="workstation-processing-detail">
                <p>{selectedEvidence.observed}</p>
                <small>{selectedEvidence.meaning}</small>
              </div>
            ) : (
              <div className="workstation-raw" data-testid="advanced-raw-evidence">
                <div><FileJson2 size={16} /><span>FreightBridge-visible evidence</span></div>
                <pre>{raw(payloadPreview ?? failureDrill)}</pre>
                <small>Only evidence available to FreightBridge is shown.</small>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function AdvancedEvidenceSource({
  source,
  run,
  failureDrill,
  inspected,
  onInspect,
}: {
  source: IncidentEvidenceSource;
  run: LabRun;
  failureDrill: Record<string, unknown> | null;
  inspected: boolean;
  onInspect: () => void;
}) {
  return (
    <article className={'guided-evidence-source ' + (inspected ? 'inspected' : '')} data-testid={'evidence-source-' + source.id}>
      <button className="secondary-button" type="button" onClick={onInspect}>
        {inspected ? 'Inspected' : source.inspectedLabel}
      </button>
      <div>
        <span>{source.source}</span>
        <strong>{source.title}</strong>
        <p>{source.summary}</p>
      </div>
      {inspected && (
        <div className="guided-evidence-detail">
          {source.details.map((detail) => <p key={detail}>{detail}</p>)}
          {source.rawFrom && <pre>{sourceRaw(source.rawFrom, run, failureDrill)}</pre>}
        </div>
      )}
    </article>
  );
}

function AdvancedCode({
  mission,
  payloadPreview,
  activeFileId,
  versionDraft,
  sftpDraft,
  onActiveFile,
  onVersionDraft,
  onSftpDraft,
}: {
  mission: IncidentMissionDefinition;
  payloadPreview: Record<string, unknown> | null;
  activeFileId: string;
  versionDraft: VersionDraft;
  sftpDraft: SftpDraft;
  onActiveFile: (id: string) => void;
  onVersionDraft: (draft: VersionDraft) => void;
  onSftpDraft: (draft: SftpDraft) => void;
}) {
  const versionFiles = [
    { id: 'received', path: 'Incoming/midwest_214_profile.json' },
    { id: 'contract', path: 'Partner Contracts/midwest_214_profile.json' },
    { id: 'edit', path: 'Fix/version_override.training.json' },
  ];
  const sftpFiles = [
    { id: 'received', path: 'Transport/host_key_probe.json' },
    { id: 'contract', path: 'Partner Contracts/midwest_sftp_trust.json' },
    { id: 'edit', path: 'Fix/sftp_trust.training.json' },
  ];
  const files = mission.scenarioKey === 'X12_214_WRONG_VERSION' ? versionFiles : sftpFiles;

  return (
    <div className="workstation-code advanced-workstation-code" data-testid="advanced-workstation-code">
      <aside className="workstation-file-tree">
        <div className="workstation-pane-heading"><div><span>Workspace</span><strong>Controlled training files</strong></div></div>
        <div className="workstation-file-list">
          {files.map((file) => (
            <button key={file.id} className={activeFileId === file.id ? 'active' : ''} type="button" onClick={() => onActiveFile(file.id)}>
              <FileCode2 size={14} /><span>{file.path}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workstation-editor">
        <div className="workstation-editor-bar">
          <span>{files.find((file) => file.id === activeFileId)?.path}</span>
          <small>{activeFileId === 'edit' ? 'Editable training control' : 'Read only'}</small>
        </div>
        {mission.scenarioKey === 'X12_214_WRONG_VERSION'
          ? <VersionEditor fileId={activeFileId} payloadPreview={payloadPreview} draft={versionDraft} onDraft={onVersionDraft} />
          : <SftpEditor fileId={activeFileId} payloadPreview={payloadPreview} draft={sftpDraft} onDraft={onSftpDraft} />}
      </section>

      <aside className="workstation-code-note">
        <Server size={19} />
        <strong>{activeFileId === 'edit' ? 'Make the correction here' : 'Compare before editing'}</strong>
        <p>
          {mission.scenarioKey === 'X12_214_WRONG_VERSION'
            ? 'The received 214 is structurally valid. Your edit should make its version identifiers match the active Midwest profile without disabling version checks.'
            : 'The failure happens before authentication or message ingestion. Restore trusted endpoint identity and verify readiness without replaying business data.'}
        </p>
      </aside>
    </div>
  );
}

function VersionEditor({
  fileId,
  payloadPreview,
  draft,
  onDraft,
}: {
  fileId: string;
  payloadPreview: Record<string, unknown> | null;
  draft: VersionDraft;
  onDraft: (draft: VersionDraft) => void;
}) {
  if (fileId === 'received') {
    return <pre data-testid="advanced-code-content"><code>{JSON.stringify({
      receivedIsa12: payloadPreview?.isa12 ?? '00501',
      receivedGs08: payloadPreview?.gs08 ?? '005010',
      x12: payloadPreview?.x12 ?? '214 payload',
    }, null, 2)}</code></pre>;
  }
  if (fileId === 'contract') {
    return <pre data-testid="advanced-code-content"><code>{JSON.stringify({
      partner: 'Midwest Carrier',
      supportedIsa12: payloadPreview?.supportedIsa12 ?? '00401',
      supportedGs08: payloadPreview?.supportedGs08 ?? '004010',
      policy: 'Reject unsupported partner profile versions',
    }, null, 2)}</code></pre>;
  }
  return (
    <div className="advanced-edit-form" data-testid="advanced-version-editor">
      <label>
        <span>ISA12 version</span>
        <select value={draft.isa12} onChange={(event) => onDraft({ ...draft, isa12: event.target.value })}>
          {VERSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <small>Received: 00501 · Midwest profile: 00401</small>
      </label>
      <label>
        <span>GS08 implementation version</span>
        <select value={draft.gs08} onChange={(event) => onDraft({ ...draft, gs08: event.target.value })}>
          {GROUP_VERSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <small>Received: 005010 · Midwest profile: 004010</small>
      </label>
      <pre><code>{JSON.stringify(draft, null, 2)}</code></pre>
      <div className={'advanced-edit-status ' + (draft.isa12 === '00401' && draft.gs08 === '004010' ? 'ready' : '')}>
        {draft.isa12 === '00401' && draft.gs08 === '004010'
          ? 'Draft matches the active Midwest profile.'
          : 'Draft still conflicts with the active Midwest profile.'}
      </div>
    </div>
  );
}

function SftpEditor({
  fileId,
  payloadPreview,
  draft,
  onDraft,
}: {
  fileId: string;
  payloadPreview: Record<string, unknown> | null;
  draft: SftpDraft;
  onDraft: (draft: SftpDraft) => void;
}) {
  if (fileId === 'received') {
    return <pre data-testid="advanced-code-content"><code>{JSON.stringify({
      probe: payloadPreview?.probe ?? 'host-key-verification',
      expectedFingerprint: payloadPreview?.expectedFingerprint ?? 'temporary-invalid-fingerprint',
      transactionCreated: false,
      businessMessageIngested: false,
    }, null, 2)}</code></pre>;
  }
  if (fileId === 'contract') {
    return <pre data-testid="advanced-code-content"><code>{JSON.stringify({
      partner: 'Midwest Carrier',
      hostKeyPolicy: 'Pinned and verified',
      requiredDirectories: ['/inbound', '/outbound', '/archive', '/error'],
      verifyBeforeReplay: true,
    }, null, 2)}</code></pre>;
  }
  return (
    <div className="advanced-edit-form" data-testid="advanced-sftp-editor">
      <label>
        <span>Expected host identity</span>
        <select value={draft.hostKeyMode} onChange={(event) => onDraft({ ...draft, hostKeyMode: event.target.value })}>
          <option value="temporary-invalid-fingerprint">Temporary invalid fingerprint</option>
          <option value="verified-configured-fingerprint">Verified configured Midwest fingerprint</option>
        </select>
        <small>Use the verified configured endpoint identity; never disable host-key checking.</small>
      </label>
      <label className="advanced-checkbox">
        <input
          type="checkbox"
          checked={draft.replayBusinessMessage}
          onChange={(event) => onDraft({ ...draft, replayBusinessMessage: event.target.checked })}
        />
        <span>Replay a business message immediately after changing trust</span>
      </label>
      <small className="advanced-safety-note">For this pre-transaction failure, recovery should be proven with connectivity/readiness first. Leave business replay off.</small>
      <pre><code>{JSON.stringify(draft, null, 2)}</code></pre>
      <div className={'advanced-edit-status ' + (draft.hostKeyMode === 'verified-configured-fingerprint' && !draft.replayBusinessMessage ? 'ready' : '')}>
        {draft.hostKeyMode === 'verified-configured-fingerprint' && !draft.replayBusinessMessage
          ? 'Draft is safe to verify: trusted endpoint, no business replay.'
          : 'Fix the trust setting and keep business replay disabled.'}
      </div>
    </div>
  );
}

function AdvancedAnswer({
  mission,
  lastHealthyId,
  diagnosisId,
  requiredEvidenceInspected,
  fixReady,
  recoveryRun,
  recovery,
  verified,
  statusUpdate,
  working,
  completed,
  onLastHealthy,
  onDiagnosis,
  onApplyFix,
  onStatusUpdate,
  onComplete,
}: {
  mission: IncidentMissionDefinition;
  lastHealthyId: string | null;
  diagnosisId: string | null;
  requiredEvidenceInspected: boolean;
  fixReady: boolean;
  recoveryRun: LabRun | null;
  recovery: Record<string, unknown> | null;
  verified: boolean;
  statusUpdate: string;
  working: boolean;
  completed: boolean;
  onLastHealthy: (id: string) => void;
  onDiagnosis: (id: string) => void;
  onApplyFix: () => void;
  onStatusUpdate: (value: string) => void;
  onComplete: () => void;
}) {
  const diagnosisCorrect = diagnosisId === mission.correctDiagnosisId;
  const lastHealthyCorrect = lastHealthyId === mission.correctLastHealthyId;

  return (
    <div className="workstation-answer advanced-workstation-answer" data-testid="advanced-workstation-answer">
      <div className="workstation-answer-intro">
        <span>Advanced diagnosis</span>
        <h2>Diagnose the boundary, then make the fix in Code.</h2>
        <p>You still get structured diagnosis choices here, but remediation is no longer a multiple-choice answer. The actual correction lives in the editable Code file.</p>
      </div>

      <ChoicePanel
        testId="last-healthy-panel"
        prompt="Where did FreightBridge evidence last look healthy?"
        options={mission.lastHealthyOptions}
        selected={lastHealthyId}
        correctId={mission.correctLastHealthyId}
        onSelect={onLastHealthy}
      />

      {!requiredEvidenceInspected && (
        <div className="workstation-answer-hint" data-testid="diagnosis-gate">
          <AlertTriangle size={18} />
          <p>Inspect all required Console evidence before selecting the root cause.</p>
        </div>
      )}

      <ChoicePanel
        testId="diagnosis-panel"
        prompt="What is the most accurate FreightBridge diagnosis?"
        options={mission.diagnosisOptions}
        selected={diagnosisId}
        correctId={mission.correctDiagnosisId}
        disabled={!requiredEvidenceInspected}
        onSelect={onDiagnosis}
      />

      <div className={'advanced-fix-readiness ' + (fixReady ? 'ready' : '')} data-testid="advanced-fix-readiness">
        <FileCode2 size={18} />
        <div>
          <strong>{fixReady ? 'Code fix ready' : 'Code fix not ready'}</strong>
          <p>{fixReady ? 'Your controlled configuration matches the expected safe correction.' : 'Open Code and correct the controlled training configuration before verification.'}</p>
        </div>
      </div>

      <button
        className="primary-button"
        type="button"
        disabled={working || !requiredEvidenceInspected || !lastHealthyCorrect || !diagnosisCorrect || !fixReady}
        onClick={onApplyFix}
      >
        {working ? 'Verifying correction…' : mission.scenarioKey === 'X12_214_WRONG_VERSION'
          ? 'Apply Version Fix & Run Again'
          : 'Apply Trust Fix & Run Readiness'}
      </button>

      {recoveryRun && <AdvancedVerification mission={mission} recovery={recovery} verified={verified} />}

      {verified && (
        <label className="guided-status-update">
          <span>Write Mike a concise incident update</span>
          <textarea value={statusUpdate} onChange={(event) => onStatusUpdate(event.target.value)} placeholder={mission.statusPrompt} />
        </label>
      )}

      <button
        className="secondary-button"
        type="button"
        disabled={!verified || statusUpdate.trim().length < 40 || completed}
        onClick={onComplete}
      >
        <CheckCircle2 size={16} /> {completed ? 'Debrief Complete' : 'Complete Debrief'}
      </button>
    </div>
  );
}

function ChoicePanel({
  testId,
  prompt,
  options,
  selected,
  correctId,
  disabled = false,
  onSelect,
}: {
  testId: string;
  prompt: string;
  options: IncidentOption[];
  selected: string | null;
  correctId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const selectedOption = options.find((option) => option.id === selected);
  return (
    <fieldset className="workstation-options" data-testid={testId}>
      <legend>{prompt}</legend>
      {options.map((option) => (
        <label key={option.id} className={selected === option.id ? 'selected' : ''}>
          <input
            type="radio"
            name={testId}
            value={option.id}
            checked={selected === option.id}
            disabled={disabled}
            onChange={() => onSelect(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
      {selectedOption && (
        <div className={'workstation-option-feedback ' + (selected === correctId ? 'correct' : 'incorrect')}>
          {selectedOption.explanation}
        </div>
      )}
    </fieldset>
  );
}

function AdvancedVerification({
  mission,
  recovery,
  verified,
}: {
  mission: IncidentMissionDefinition;
  recovery: Record<string, unknown> | null;
  verified: boolean;
}) {
  const entries = mission.scenarioKey === 'X12_214_WRONG_VERSION'
    ? [
        ['Recovery Kind', stringValue(recovery?.recoveryKind)],
        ['Corrected ISA12', stringValue(recovery?.correctedIsa12)],
        ['Corrected GS08', stringValue(recovery?.correctedGs08)],
        ['Profile Compatibility', stringValue(recovery?.profileCompatibility)],
        ['Mapping', stringValue(recovery?.mappingStatus)],
        ['Apex-Facing Evidence', recovery?.apexFacingEvidence === true ? 'PRESENT' : 'MISSING'],
      ]
    : [
        ['Recovery Kind', stringValue(recovery?.recoveryKind)],
        ['Connection Verified', recovery?.connectionVerified === true ? 'YES' : 'NO'],
        ['Host-Key Pinning', stringValue(recovery?.hostKeyPinning)],
        ['Transaction Created', recovery?.transactionCreated === true ? 'YES' : 'NO'],
        ['Message Replay Attempted', recovery?.messageReplayAttempted === true ? 'YES' : 'NO'],
        ['/inbound', directoryValue(recovery, 'inbound')],
        ['/outbound', directoryValue(recovery, 'outbound')],
        ['/archive', directoryValue(recovery, 'archive')],
        ['/error', directoryValue(recovery, 'error')],
      ];

  return (
    <article className={'guided-verification ' + (verified ? 'verified' : '')} data-testid="verification-panel">
      <div>
        <CheckCircle2 size={20} />
        <div><strong>{verified ? 'Recovery SUCCEEDED' : 'Recovery incomplete'}</strong><p>{mission.verification}</p></div>
      </div>
      {mission.scenarioKey === 'X12_214_WRONG_VERSION' && <p data-testid="recovery-correlation">Recovery stayed correlated to the same incident load.</p>}
      <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </article>
  );
}

function verifyRecovery(
  mission: IncidentMissionDefinition,
  incidentRun: LabRun | null,
  recoveryRun: LabRun | null,
  recovery: Record<string, unknown> | null,
): boolean {
  if (!incidentRun || !recoveryRun || recovery?.status !== 'SUCCEEDED') return false;
  if (mission.scenarioKey === 'X12_214_WRONG_VERSION') {
    return (
      recoveryRun.businessIdentifier === incidentRun.businessIdentifier
      && recovery.sameBusinessIdentifier === true
      && recovery.correctedIsa12 === '00401'
      && recovery.correctedGs08 === '004010'
      && recovery.profileCompatibility === 'SUPPORTED'
      && recovery.mappingStatus === 'SUCCEEDED'
      && recovery.apexFacingEvidence === true
    );
  }
  const directories = record(recovery.directories);
  return (
    recovery.connectionVerified === true
    && recovery.hostKeyPinning === 'VERIFIED'
    && recovery.transactionCreated === false
    && recovery.messageReplayAttempted === false
    && directories?.inbound === true
    && directories?.outbound === true
    && directories?.archive === true
    && directories?.error === true
  );
}

function sourceRaw(
  source: NonNullable<IncidentEvidenceSource['rawFrom']>,
  run: LabRun,
  failureDrill: Record<string, unknown> | null,
): string {
  const value = source === 'failureDrill' ? failureDrill
    : source === 'payloadPreview' ? failureDrill?.payloadPreview
      : source === 'observedFailure' ? failureDrill?.observed
        : source === 'steps' ? run.steps
          : run.resultSummary;
  return raw(value);
}

function directoryValue(recovery: Record<string, unknown> | null, key: string): string {
  const directories = record(recovery?.directories);
  return directories?.[key] === true ? 'READY' : 'NOT READY';
}

function statusIcon(status: string) {
  if (status === 'SUCCEEDED') return <CheckCircle2 size={15} />;
  if (status === 'FAILED') return <XCircle size={15} />;
  return <Circle size={15} />;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown, fallback = '—'): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function raw(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
}

function WorkstationError({ message }: { message: string }) {
  return (
    <article className="panel training-alert" role="alert">
      <AlertTriangle size={20} />
      <div><h2>Advanced incident hit an unexpected system issue.</h2><p>{message}</p></div>
    </article>
  );
}

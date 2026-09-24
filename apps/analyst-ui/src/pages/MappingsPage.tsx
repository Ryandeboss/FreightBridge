import { CheckCircle, GitBranch, RefreshCw, Save, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  abandonMapping,
  activateMapping,
  cloneDraft,
  fetchConfigurationChanges,
  fetchMapping,
  fetchMappings,
  updateMapping,
  updateMappingRule,
  validateMapping,
  type ConfigurationChange,
  type MappingProfile,
  type MappingRule,
} from '../api/configuration';
import { PageTitle, SearchButton } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';

export function MappingsPage() {
  const { token, handleApiError } = useOperationsSession();
  const [mappings, setMappings] = useState<MappingProfile[]>([]);
  const [status, setStatus] = useState('ACTIVE');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMappings(token, { status: status || undefined, limit: 100 });
      setMappings(result.mappings);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Mappings could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page-stack" data-testid="mappings-page">
      <PageTitle eyebrow="Configuration" title="Mapping Profiles">
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      <form className="filter-grid" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
            <option value="ABANDONED">Abandoned</option>
          </select>
        </label>
        <SearchButton />
      </form>

      {isLoading && <LoadingBlock label="Loading mappings" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {!isLoading && !error && (
        <article className="panel table-panel">
          <div className="panel-header">
            <h2>{mappings.length} mapping profiles</h2>
          </div>
          {!mappings.length ? (
            <EmptyBlock title="No mapping profiles match those filters" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mapping</th>
                    <th>Partner</th>
                    <th>Flow</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td>
                        <Link to={`/mappings/${mapping.id}`}>{mapping.mappingKey}</Link>
                        <small>{mapping.name}</small>
                      </td>
                      <td>{mapping.partnerCode}</td>
                      <td>{mapping.sourceDocumentType} to {mapping.targetDocumentType}</td>
                      <td>v{mapping.versionNumber}</td>
                      <td><StatusBadge value={mapping.status} /></td>
                      <td><StatusBadge value={mapping.validationStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}
    </section>
  );
}

export function MappingDetailPage() {
  const { mappingId = '' } = useParams();
  const navigate = useNavigate();
  const { token, handleApiError } = useOperationsSession();
  const [mapping, setMapping] = useState<MappingProfile | null>(null);
  const [changes, setChanges] = useState<ConfigurationChange[]>([]);
  const [settingsJson, setSettingsJson] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !mappingId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchMapping(token, mappingId);
      setMapping(next);
      setSettingsJson(JSON.stringify(next.settings, null, 2));
      const changeResult = await fetchConfigurationChanges(token, { entityId: mappingId, limit: 25 });
      setChanges(changeResult.changes);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Mapping could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, mappingId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !mapping) {
      return;
    }
    setMessage(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(settingsJson) as Record<string, unknown>;
    } catch {
      setMessage('Settings JSON is invalid.');
      return;
    }
    try {
      const updated = await updateMapping(token, mapping.id, { settings: parsed, changeNote: changeNote || null });
      setMapping(updated);
      setSettingsJson(JSON.stringify(updated.settings, null, 2));
      setMessage('Draft saved.');
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : 'Draft save failed.');
    }
  }

  async function clone() {
    if (!token || !mapping) {
      return;
    }
    const draft = await cloneDraft(token, mapping.id, changeNote || 'Draft cloned from Analyst Console');
    navigate(`/mappings/${draft.id}`);
  }

  async function action(task: 'validate' | 'activate' | 'abandon') {
    if (!token || !mapping) {
      return;
    }
    try {
      const updated =
        task === 'validate'
          ? await validateMapping(token, mapping.id)
          : task === 'activate'
            ? await activateMapping(token, mapping.id)
            : await abandonMapping(token, mapping.id);
      setMapping(updated);
      setSettingsJson(JSON.stringify(updated.settings, null, 2));
      setMessage(`Mapping ${task} complete.`);
      await load();
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : `Mapping ${task} failed.`);
    }
  }

  async function saveRule(rule: MappingRule, configurationText: string, notes: string) {
    if (!token || !mapping) {
      return;
    }
    let configuration: Record<string, unknown>;
    try {
      configuration = JSON.parse(configurationText) as Record<string, unknown>;
    } catch {
      setMessage(`Rule ${rule.ruleKey} JSON is invalid.`);
      return;
    }
    await updateMappingRule(token, mapping.id, rule.id, { configuration, notes: notes || null });
    setMessage(`Rule ${rule.ruleKey} saved.`);
    await load();
  }

  return (
    <section className="page-stack" data-testid="mapping-detail-page">
      <PageTitle eyebrow="Mapping configuration" title={mapping?.mappingKey ?? 'Mapping'}>
        <Link className="secondary-button" to="/mappings">Mappings</Link>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading mapping" />}
      {error && <ErrorBlock message={error} onRetry={load} />}
      {message && <p className="form-message form-info">{message}</p>}

      {mapping && !isLoading && (
        <>
          <article className="panel">
            <div className="detail-header">
              <div>
                <h2>{mapping.name}</h2>
                <p>{mapping.partnerCode} / {mapping.sourceDocumentType} to {mapping.targetDocumentType}</p>
              </div>
              <StatusBadge value={mapping.status} />
            </div>
            <div className="definition-grid">
              <Definition label="Version" value={`v${mapping.versionNumber}`} />
              <Definition label="Validation" value={mapping.validationStatus} />
              <Definition label="Updated" value={formatDateTime(mapping.updatedAt)} />
              <Definition label="Activated" value={mapping.activatedAt ? formatDateTime(mapping.activatedAt) : 'None'} />
              <Definition label="Based On" value={mapping.basedOnProfileId ?? 'None'} />
              <Definition label="Profile ID" value={mapping.id} />
            </div>
          </article>

          <form className="panel editor-stack" onSubmit={saveDraft}>
            <div className="panel-header">
              <h2>Settings</h2>
              <StatusBadge value={mapping.validationStatus} />
            </div>
            <label>
              <span>Change Note</span>
              <input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
            </label>
            <label>
              <span>Profile Settings JSON</span>
              <textarea
                className="code-textarea"
                value={settingsJson}
                readOnly={mapping.status !== 'DRAFT'}
                onChange={(event) => setSettingsJson(event.target.value)}
              />
            </label>
            <div className="title-actions">
              {mapping.status === 'ACTIVE' && (
                <button className="secondary-button" type="button" onClick={() => void clone()}>
                  <GitBranch size={16} />
                  Clone Draft
                </button>
              )}
              {mapping.status === 'DRAFT' && (
                <>
                  <button className="secondary-button" type="submit">
                    <Save size={16} />
                    Save Draft
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void action('validate')}>
                    <CheckCircle size={16} />
                    Validate
                  </button>
                  <button className="primary-button" type="button" onClick={() => void action('activate')}>
                    <CheckCircle size={16} />
                    Activate
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void action('abandon')}>
                    <Trash2 size={16} />
                    Abandon
                  </button>
                </>
              )}
            </div>
          </form>

          <article className="panel">
            <div className="panel-header">
              <h2>Rules</h2>
            </div>
            <div className="compact-list">
              {mapping.rules.map((rule) => (
                <RuleEditor key={rule.id} rule={rule} disabled={mapping.status !== 'DRAFT'} onSave={saveRule} />
              ))}
            </div>
          </article>

          <div className="content-grid two-column">
            <article className="panel">
              <div className="panel-header">
                <h2>Versions</h2>
              </div>
              <div className="compact-list">
                {mapping.versions.map((version) => (
                  <Link className="compact-row" key={version.id} to={`/mappings/${version.id}`}>
                    <div>
                      <strong>v{version.versionNumber}</strong>
                      <span>{version.changeNote ?? version.name}</span>
                    </div>
                    <StatusBadge value={version.status} />
                  </Link>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Change History</h2>
              </div>
              {!changes.length ? (
                <EmptyBlock title="No changes recorded" />
              ) : (
                <ol className="timeline">
                  {changes.map((change) => (
                    <li key={change.id}>
                      <span>{formatDateTime(change.createdAt)}</span>
                      <strong>{change.action}</strong>
                      <p>{change.note ?? change.entityType}</p>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RuleEditor({
  rule,
  disabled,
  onSave,
}: {
  rule: MappingRule;
  disabled: boolean;
  onSave: (rule: MappingRule, configurationText: string, notes: string) => Promise<void>;
}) {
  const [configurationText, setConfigurationText] = useState(JSON.stringify(rule.configuration, null, 2));
  const [notes, setNotes] = useState(rule.notes ?? '');

  return (
    <div className="rule-editor">
      <div className="compact-row rule-summary">
        <div>
          <strong>{rule.sequence}. {rule.ruleKey}</strong>
          <span>{rule.sourcePath ?? 'n/a'} to {rule.targetPath ?? 'n/a'} / {rule.transformation}</span>
        </div>
        <StatusBadge value={rule.required ? 'REQUIRED' : 'OPTIONAL'} />
      </div>
      <label>
        <span>Rule Configuration JSON</span>
        <textarea
          className="code-textarea small"
          value={configurationText}
          readOnly={disabled}
          onChange={(event) => setConfigurationText(event.target.value)}
        />
      </label>
      <label>
        <span>Notes</span>
        <textarea value={notes} readOnly={disabled} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {!disabled && (
        <button className="secondary-button" type="button" onClick={() => void onSave(rule, configurationText, notes)}>
          <Save size={16} />
          Save Rule
        </button>
      )}
    </div>
  );
}

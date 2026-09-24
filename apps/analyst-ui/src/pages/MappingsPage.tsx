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
import { useOperationsSession } from '../auth/OperationsSession';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageTitle, SearchButton } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/dates';

type MappingFilters = {
  partnerCode: string;
  mappingKey: string;
  direction: string;
  status: string;
  documentType: string;
};

type MappingSettings = Record<string, unknown>;
type MappingAction = 'activate' | 'abandon';

const equipmentTypes = ['DRY_VAN_53', 'REFRIGERATED_53', 'FLATBED'];
const referenceTypes = ['BOL', 'PO', 'CUSTOMER_REFERENCE'];
const tenderDecisions = ['ACCEPTED', 'REJECTED'];
const shipmentStatuses = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

const defaultFilters: MappingFilters = {
  partnerCode: '',
  mappingKey: '',
  direction: '',
  status: 'ACTIVE',
  documentType: '',
};

export function MappingsPage() {
  const { token, handleApiError } = useOperationsSession();
  const [mappings, setMappings] = useState<MappingProfile[]>([]);
  const [filters, setFilters] = useState<MappingFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMappings(token, {
        partnerCode: filters.partnerCode || undefined,
        mappingKey: filters.mappingKey || undefined,
        direction: filters.direction || undefined,
        status: filters.status || undefined,
        documentType: filters.documentType || undefined,
        limit: 100,
      });
      setMappings(result.mappings);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Mappings could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, handleApiError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter(name: keyof MappingFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

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
          <span>Partner</span>
          <input value={filters.partnerCode} placeholder="APEX or MWCX" onChange={(event) => updateFilter('partnerCode', event.target.value)} />
        </label>
        <label>
          <span>Mapping Key</span>
          <input value={filters.mappingKey} placeholder="CANONICAL_TO_MWCX_204" onChange={(event) => updateFilter('mappingKey', event.target.value)} />
        </label>
        <label>
          <span>Direction</span>
          <select value={filters.direction} onChange={(event) => updateFilter('direction', event.target.value)}>
            <option value="">Any</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
            <option value="ABANDONED">Abandoned</option>
          </select>
        </label>
        <label>
          <span>Document Type</span>
          <input value={filters.documentType} placeholder="204, 990, 997" onChange={(event) => updateFilter('documentType', event.target.value)} />
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
  const [settingsDraft, setSettingsDraft] = useState<MappingSettings>({});
  const [profileDraft, setProfileDraft] = useState({ name: '', description: '', changeNote: '' });
  const [confirmAction, setConfirmAction] = useState<MappingAction | null>(null);
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
      setSettingsDraft(next.settings);
      setProfileDraft({
        name: next.name,
        description: next.description ?? '',
        changeNote: next.changeNote ?? '',
      });
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
    if (!token || !mapping || mapping.status !== 'DRAFT') {
      return;
    }
    setMessage(null);
    try {
      const updated = await updateMapping(token, mapping.id, {
        name: profileDraft.name,
        description: profileDraft.description || null,
        changeNote: profileDraft.changeNote || null,
        settings: settingsDraft,
      });
      setMapping(updated);
      setSettingsDraft(updated.settings);
      setProfileDraft({
        name: updated.name,
        description: updated.description ?? '',
        changeNote: updated.changeNote ?? '',
      });
      setMessage('Draft saved.');
      await load();
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : 'Draft save failed.');
    }
  }

  async function createDraft() {
    if (!token || !mapping) {
      return;
    }
    const draft = await cloneDraft(token, mapping.id, profileDraft.changeNote || 'Draft cloned from Analyst Console');
    navigate(`/mappings/${draft.id}`);
  }

  async function runAction(task: MappingAction | 'validate') {
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
      setSettingsDraft(updated.settings);
      setProfileDraft({
        name: updated.name,
        description: updated.description ?? '',
        changeNote: updated.changeNote ?? '',
      });
      setMessage(`Mapping ${task} complete.`);
      setConfirmAction(null);
      await load();
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : `Mapping ${task} failed.`);
    }
  }

  async function saveRule(rule: MappingRule, notes: string) {
    if (!token || !mapping || mapping.status !== 'DRAFT') {
      return;
    }
    await updateMappingRule(token, mapping.id, rule.id, { notes: notes || null });
    setMessage(`Rule ${rule.ruleKey} saved.`);
    await load();
  }

  const isDraft = mapping?.status === 'DRAFT';
  const isActive = mapping?.status === 'ACTIVE';
  const canActivate = isDraft && mapping?.validationStatus === 'VALID';

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
              <Definition label="Mapping Key" value={mapping.mappingKey} />
              <Definition label="Name" value={mapping.name} />
              <Definition label="Description" value={mapping.description ?? 'None'} />
              <Definition label="Partner" value={`${mapping.partnerCode} / ${mapping.partnerName}`} />
              <Definition label="Direction" value={mapping.direction} />
              <Definition label="Source" value={`${mapping.sourceFormat} / ${mapping.sourceDocumentType}`} />
              <Definition label="Target" value={`${mapping.targetFormat} / ${mapping.targetDocumentType}`} />
              <Definition label="Version" value={`v${mapping.versionNumber}`} />
              <Definition label="Status" value={mapping.status} />
              <Definition label="Validation" value={mapping.validationStatus} />
              <Definition label="Based On" value={mapping.basedOnProfileId ?? 'None'} />
              <Definition label="Created" value={formatDateTime(mapping.createdAt)} />
              <Definition label="Updated" value={formatDateTime(mapping.updatedAt)} />
              <Definition label="Validated" value={mapping.validatedAt ? formatDateTime(mapping.validatedAt) : 'None'} />
              <Definition label="Activated" value={mapping.activatedAt ? formatDateTime(mapping.activatedAt) : 'None'} />
              <Definition label="Change Note" value={mapping.changeNote ?? 'None'} />
              <Definition label="Profile ID" value={mapping.id} />
            </div>
          </article>

          <form className="panel editor-stack" onSubmit={saveDraft}>
            <div className="panel-header">
              <h2>Profile Configuration</h2>
              <StatusBadge value={mapping.validationStatus} />
            </div>

            {isActive && <p className="muted-text">Active mappings are read-only. Create a draft to change runtime configuration.</p>}

            <div className="editor-grid">
              <label>
                <span>Name</span>
                <input value={profileDraft.name} readOnly={!isDraft} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} />
              </label>
              <label>
                <span>Change Note</span>
                <input value={profileDraft.changeNote} readOnly={!isDraft} onChange={(event) => setProfileDraft({ ...profileDraft, changeNote: event.target.value })} />
              </label>
              <label className="wide-field">
                <span>Description</span>
                <textarea value={profileDraft.description} readOnly={!isDraft} onChange={(event) => setProfileDraft({ ...profileDraft, description: event.target.value })} />
              </label>
            </div>

            <MappingSettingsForm mappingKey={mapping.mappingKey} settings={settingsDraft} readOnly={!isDraft} onChange={setSettingsDraft} />

            {mapping.validationErrors.length > 0 && (
              <div className="form-message form-error">
                {mapping.validationErrors.map((item, index) => (
                  <p key={index}>{String(item.field ?? 'settings')}: {String(item.message ?? 'Invalid configuration')}</p>
                ))}
              </div>
            )}

            <div className="title-actions">
              {isActive && (
                <button className="secondary-button" type="button" onClick={() => void createDraft()}>
                  <GitBranch size={16} />
                  Create Draft
                </button>
              )}
              {isDraft && (
                <>
                  <button className="secondary-button" type="submit">
                    <Save size={16} />
                    Save Draft
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void runAction('validate')}>
                    <CheckCircle size={16} />
                    Validate Draft
                  </button>
                  <button className="primary-button" type="button" disabled={!canActivate} onClick={() => setConfirmAction('activate')}>
                    <CheckCircle size={16} />
                    Activate Mapping
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setConfirmAction('abandon')}>
                    <Trash2 size={16} />
                    Abandon Draft
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
                <RuleEditor key={rule.id} rule={rule} disabled={!isDraft} onSave={saveRule} />
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

      {confirmAction === 'activate' && (
        <ConfirmDialog
          title="Activate mapping"
          message="Activating this mapping will archive the current active version and make this version the runtime mapping for new transactions."
          confirmLabel="Activate Mapping"
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runAction('activate')}
        />
      )}

      {confirmAction === 'abandon' && (
        <ConfirmDialog
          title="Abandon draft"
          message="Abandoning this draft preserves it in configuration history but prevents activation."
          confirmLabel="Abandon Draft"
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runAction('abandon')}
        />
      )}
    </section>
  );
}

function MappingSettingsForm({
  mappingKey,
  settings,
  readOnly,
  onChange,
}: {
  mappingKey: string;
  settings: MappingSettings;
  readOnly: boolean;
  onChange: (settings: MappingSettings) => void;
}) {
  const updateSetting = (key: string, value: unknown) => onChange({ ...settings, [key]: value });
  const updateNested = (key: string, childKey: string, value: unknown) => {
    const current = objectValue(settings[key]);
    onChange({ ...settings, [key]: { ...current, [childKey]: value } });
  };
  const toggleListValue = (key: string, value: string, checked: boolean) => {
    const current = stringList(settings[key]);
    onChange({ ...settings, [key]: checked ? Array.from(new Set([...current, value])) : current.filter((item) => item !== value) });
  };

  if (mappingKey === 'APEX_LOAD_TO_CANONICAL') {
    const equipmentMap = objectValue(settings.equipmentMap);
    const referenceMap = objectValue(settings.referenceMap);
    const ignoredReferenceTypes = stringList(settings.ignoredReferenceTypes);
    return (
      <div className="settings-sections">
        <fieldset className="settings-fieldset">
          <legend>Equipment Map</legend>
          {['VAN_53', 'REEFER_53', 'FLATBED'].map((source) => (
            <SelectField key={source} label={source} value={stringValue(equipmentMap[source])} options={equipmentTypes} readOnly={readOnly} onChange={(value) => updateNested('equipmentMap', source, value)} />
          ))}
        </fieldset>
        <fieldset className="settings-fieldset">
          <legend>Reference Map</legend>
          {['BOL', 'PO', 'CUSTOMER_REF'].map((source) => (
            <SelectField key={source} label={source} value={stringValue(referenceMap[source])} options={referenceTypes} readOnly={readOnly} onChange={(value) => updateNested('referenceMap', source, value)} />
          ))}
        </fieldset>
        <fieldset className="settings-fieldset">
          <legend>Ignored Reference Types</legend>
          <label className="toggle-row">
            <input type="checkbox" checked={ignoredReferenceTypes.includes('APPOINTMENT')} disabled={readOnly} onChange={(event) => toggleListValue('ignoredReferenceTypes', 'APPOINTMENT', event.target.checked)} />
            <span>APPOINTMENT</span>
          </label>
        </fieldset>
      </div>
    );
  }

  if (mappingKey === 'CANONICAL_TO_MWCX_204') {
    return (
      <div className="settings-grid">
        <TextField label="senderId" value={stringValue(settings.senderId)} readOnly={readOnly} onChange={(value) => updateSetting('senderId', value)} />
        <TextField label="receiverId" value={stringValue(settings.receiverId)} readOnly={readOnly} onChange={(value) => updateSetting('receiverId', value)} />
        <SelectField label="x12Version" value={stringValue(settings.x12Version)} options={['004010']} readOnly={readOnly} onChange={(value) => updateSetting('x12Version', value)} />
        <SelectField label="isaControlVersion" value={stringValue(settings.isaControlVersion)} options={['00401']} readOnly={readOnly} onChange={(value) => updateSetting('isaControlVersion', value)} />
        <SelectField label="functionalIdentifier" value={stringValue(settings.functionalIdentifier)} options={['SM']} readOnly={readOnly} onChange={(value) => updateSetting('functionalIdentifier', value)} />
        <SelectField label="transactionSet" value={stringValue(settings.transactionSet)} options={['204']} readOnly={readOnly} onChange={(value) => updateSetting('transactionSet', value)} />
        <SelectField label="usageIndicator" value={stringValue(settings.usageIndicator)} options={['T']} readOnly={readOnly} onChange={(value) => updateSetting('usageIndicator', value)} />
        <TextField label="paymentMethod" value={stringValue(settings.paymentMethod)} readOnly={readOnly} onChange={(value) => updateSetting('paymentMethod', value)} />
        <TextField label="bolQualifier" value={stringValue(settings.bolQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('bolQualifier', value)} />
        <TextField label="poQualifier" value={stringValue(settings.poQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('poQualifier', value)} />
        <TextField label="pickupDateQualifier" value={stringValue(settings.pickupDateQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('pickupDateQualifier', value)} />
        <TextField label="pickupTimeQualifier" value={stringValue(settings.pickupTimeQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('pickupTimeQualifier', value)} />
        <TextField label="deliveryDateQualifier" value={stringValue(settings.deliveryDateQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('deliveryDateQualifier', value)} />
        <TextField label="deliveryTimeQualifier" value={stringValue(settings.deliveryTimeQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('deliveryTimeQualifier', value)} />
        <TextField label="pickupStopReason" value={stringValue(settings.pickupStopReason)} readOnly={readOnly} onChange={(value) => updateSetting('pickupStopReason', value)} />
        <TextField label="deliveryStopReason" value={stringValue(settings.deliveryStopReason)} readOnly={readOnly} onChange={(value) => updateSetting('deliveryStopReason', value)} />
        <TextField label="shipperEntityIdentifier" value={stringValue(settings.shipperEntityIdentifier)} readOnly={readOnly} onChange={(value) => updateSetting('shipperEntityIdentifier', value)} />
        <TextField label="consigneeEntityIdentifier" value={stringValue(settings.consigneeEntityIdentifier)} readOnly={readOnly} onChange={(value) => updateSetting('consigneeEntityIdentifier', value)} />
        <TextField label="weightQualifier" value={stringValue(settings.weightQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('weightQualifier', value)} />
        <SelectField label="timestampPolicy" value={stringValue(settings.timestampPolicy)} options={['UTC']} readOnly={readOnly} onChange={(value) => updateSetting('timestampPolicy', value)} />
      </div>
    );
  }

  if (mappingKey === 'MWCX_990_TO_CANONICAL') {
    const decisionCodeMap = objectValue(settings.decisionCodeMap);
    return (
      <div className="settings-sections">
        <X12ProfileFields settings={settings} readOnly={readOnly} onChange={updateSetting} functionalOptions={['GF']} transactionOptions={['990']} />
        <fieldset className="settings-fieldset">
          <legend>Decision Code Map</legend>
          {['A', 'D'].map((code) => (
            <SelectField key={code} label={code} value={stringValue(decisionCodeMap[code])} options={tenderDecisions} readOnly={readOnly} onChange={(value) => updateNested('decisionCodeMap', code, value)} />
          ))}
        </fieldset>
        <div className="settings-grid">
          <TextField label="carrierLoadQualifier" value={stringValue(settings.carrierLoadQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('carrierLoadQualifier', value)} />
          <TextField label="rejectionReasonQualifier" value={stringValue(settings.rejectionReasonQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('rejectionReasonQualifier', value)} />
          <TextField label="bolQualifier" value={stringValue(settings.bolQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('bolQualifier', value)} />
          <TextField label="poQualifier" value={stringValue(settings.poQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('poQualifier', value)} />
        </div>
      </div>
    );
  }

  if (mappingKey === 'MWCX_214_TO_CANONICAL') {
    const statusCodeMap = objectValue(settings.statusCodeMap);
    return (
      <div className="settings-sections">
        <X12ProfileFields settings={settings} readOnly={readOnly} onChange={updateSetting} functionalOptions={['QM']} transactionOptions={['214']} />
        <fieldset className="settings-fieldset">
          <legend>Status Code Map</legend>
          {['AF', 'X6', 'X1', 'D1'].map((code) => (
            <SelectField key={code} label={code} value={stringValue(statusCodeMap[code])} options={shipmentStatuses} readOnly={readOnly} onChange={(value) => updateNested('statusCodeMap', code, value)} />
          ))}
        </fieldset>
        <div className="settings-grid">
          <SelectField label="eventTimeCode" value={stringValue(settings.eventTimeCode)} options={['UT']} readOnly={readOnly} onChange={(value) => updateSetting('eventTimeCode', value)} />
          <TextField label="bolQualifier" value={stringValue(settings.bolQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('bolQualifier', value)} />
          <TextField label="poQualifier" value={stringValue(settings.poQualifier)} readOnly={readOnly} onChange={(value) => updateSetting('poQualifier', value)} />
        </div>
      </div>
    );
  }

  if (mappingKey === 'MWCX_997_TO_ACK') {
    const supportedAckCodes = stringList(settings.supportedAckCodes);
    return (
      <div className="settings-sections">
        <X12ProfileFields settings={settings} readOnly={readOnly} onChange={updateSetting} functionalOptions={['FA']} transactionOptions={['997']} />
        <div className="settings-grid">
          <SelectField label="acknowledgedFunctionalIdentifier" value={stringValue(settings.acknowledgedFunctionalIdentifier)} options={['SM']} readOnly={readOnly} onChange={(value) => updateSetting('acknowledgedFunctionalIdentifier', value)} />
          <SelectField label="acknowledgedTransactionSet" value={stringValue(settings.acknowledgedTransactionSet)} options={['204']} readOnly={readOnly} onChange={(value) => updateSetting('acknowledgedTransactionSet', value)} />
          <SelectField label="expectedIncludedCount" value={String(settings.expectedIncludedCount ?? 1)} options={['1']} readOnly={readOnly} onChange={(value) => updateSetting('expectedIncludedCount', Number(value))} />
          <SelectField label="expectedReceivedCount" value={String(settings.expectedReceivedCount ?? 1)} options={['1']} readOnly={readOnly} onChange={(value) => updateSetting('expectedReceivedCount', Number(value))} />
        </div>
        <fieldset className="settings-fieldset">
          <legend>Supported Ack Codes</legend>
          {['A', 'R'].map((code) => (
            <label className="toggle-row" key={code}>
              <input type="checkbox" checked={supportedAckCodes.includes(code)} disabled={readOnly} onChange={(event) => toggleListValue('supportedAckCodes', code, event.target.checked)} />
              <span>{code}</span>
            </label>
          ))}
        </fieldset>
      </div>
    );
  }

  return <p className="form-message form-error">Unsupported mapping key.</p>;
}

function X12ProfileFields({
  settings,
  readOnly,
  onChange,
  functionalOptions,
  transactionOptions,
}: {
  settings: MappingSettings;
  readOnly: boolean;
  onChange: (key: string, value: unknown) => void;
  functionalOptions: string[];
  transactionOptions: string[];
}) {
  return (
    <div className="settings-grid">
      <SelectField label="expectedSender" value={stringValue(settings.expectedSender)} options={['MWCX']} readOnly={readOnly} onChange={(value) => onChange('expectedSender', value)} />
      <SelectField label="expectedReceiver" value={stringValue(settings.expectedReceiver)} options={['FREIGHTBRIDGE']} readOnly={readOnly} onChange={(value) => onChange('expectedReceiver', value)} />
      <SelectField label="x12Version" value={stringValue(settings.x12Version)} options={['004010']} readOnly={readOnly} onChange={(value) => onChange('x12Version', value)} />
      <SelectField label="isaControlVersion" value={stringValue(settings.isaControlVersion)} options={['00401']} readOnly={readOnly} onChange={(value) => onChange('isaControlVersion', value)} />
      <SelectField label="functionalIdentifier" value={stringValue(settings.functionalIdentifier)} options={functionalOptions} readOnly={readOnly} onChange={(value) => onChange('functionalIdentifier', value)} />
      <SelectField label="transactionSet" value={stringValue(settings.transactionSet)} options={transactionOptions} readOnly={readOnly} onChange={(value) => onChange('transactionSet', value)} />
    </div>
  );
}

function TextField({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} disabled={readOnly} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
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
  onSave: (rule: MappingRule, notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(rule.notes ?? '');

  useEffect(() => {
    setNotes(rule.notes ?? '');
  }, [rule.notes]);

  return (
    <div className="rule-editor">
      <div className="compact-row rule-summary">
        <div>
          <strong>{rule.sequence}. {rule.ruleKey}</strong>
          <span>{rule.sourcePath ?? 'n/a'} to {rule.targetPath ?? 'n/a'} / {rule.transformation}</span>
        </div>
        <StatusBadge value={rule.required ? 'REQUIRED' : 'OPTIONAL'} />
      </div>
      <div className="definition-grid">
        <Definition label="Sequence" value={String(rule.sequence)} />
        <Definition label="Rule Key" value={rule.ruleKey} />
        <Definition label="Source" value={rule.sourcePath ?? 'None'} />
        <Definition label="Target" value={rule.targetPath ?? 'None'} />
        <Definition label="Transformation" value={rule.transformation} />
        <Definition label="Required" value={rule.required ? 'Yes' : 'No'} />
        <Definition label="Qualifier / Condition" value={rule.qualifierOrCondition ?? 'None'} />
        <Definition label="Failure Code" value={rule.failureCode ?? 'None'} />
      </div>
      <label>
        <span>Notes</span>
        <textarea value={notes} readOnly={disabled} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {!disabled && (
        <button className="secondary-button" type="button" onClick={() => void onSave(rule, notes)}>
          <Save size={16} />
          Save Rule
        </button>
      )}
    </div>
  );
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

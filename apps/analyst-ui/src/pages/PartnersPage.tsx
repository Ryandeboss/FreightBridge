import { RefreshCw, Save } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  fetchPartner,
  fetchPartners,
  updateCapability,
  updatePartner,
  type TradingPartner,
} from '../api/configuration';
import { PageTitle } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { BooleanBadge, StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';

export function PartnersPage() {
  const { token, handleApiError } = useOperationsSession();
  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setPartners(await fetchPartners(token));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Partners could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page-stack" data-testid="partners-page">
      <PageTitle eyebrow="Configuration" title="Trading Partners">
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading partners" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {!isLoading && !error && (
        <article className="panel table-panel">
          <div className="panel-header">
            <h2>{partners.length} partners</h2>
          </div>
          {!partners.length ? (
            <EmptyBlock title="No configured trading partners" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Role</th>
                    <th>Style</th>
                    <th>Capabilities</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id}>
                      <td>
                        <Link to={`/partners/${partner.partnerCode}`}>{partner.partnerCode}</Link>
                        <small>{partner.name}</small>
                      </td>
                      <td>{partner.businessRole}</td>
                      <td>{partner.integrationStyle}</td>
                      <td>{partner.capabilitiesEnabled}/{partner.capabilitiesTotal}</td>
                      <td><BooleanBadge value={partner.active} trueLabel="Active" falseLabel="Inactive" /></td>
                      <td>{formatDateTime(partner.updatedAt)}</td>
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

export function PartnerDetailPage() {
  const { partnerCode = '' } = useParams();
  const { token, handleApiError } = useOperationsSession();
  const [partner, setPartner] = useState<TradingPartner | null>(null);
  const [form, setForm] = useState({ name: '', description: '', supportContact: '', active: true });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !partnerCode) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchPartner(token, partnerCode);
      setPartner(next);
      setForm({
        name: next.name,
        description: next.description ?? '',
        supportContact: next.supportContact ?? '',
        active: next.active,
      });
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Partner could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, partnerCode, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !partner) {
      return;
    }
    setMessage(null);
    try {
      const updated = await updatePartner(token, partner.partnerCode, {
        name: form.name,
        description: form.description || null,
        supportContact: form.supportContact || null,
        active: form.active,
      });
      setPartner(updated);
      setMessage('Partner saved.');
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : 'Partner update failed.');
    }
  }

  async function toggleCapability(capabilityId: string, enabled: boolean) {
    if (!token || !partner) {
      return;
    }
    setMessage(null);
    try {
      await updateCapability(token, capabilityId, enabled, 'Updated from Analyst Console');
      await load();
      setMessage('Capability updated.');
    } catch (nextError) {
      handleApiError(nextError);
      setMessage(nextError instanceof ApiError ? nextError.message : 'Capability update failed.');
    }
  }

  return (
    <section className="page-stack" data-testid="partner-detail-page">
      <PageTitle eyebrow="Partner configuration" title={partner?.partnerCode ?? partnerCode}>
        <Link className="secondary-button" to="/partners">Partners</Link>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading partner" />}
      {error && <ErrorBlock message={error} onRetry={load} />}
      {message && <p className="form-message form-info">{message}</p>}

      {partner && !isLoading && (
        <>
          <article className="panel">
            <div className="detail-header">
              <div>
                <h2>{partner.name}</h2>
                <p>Revision {partner.configRevision}</p>
              </div>
              <StatusBadge value={partner.active ? 'ACTIVE' : 'INACTIVE'} />
            </div>
            <form className="editor-grid" onSubmit={submit}>
              <label>
                <span>Name</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label>
                <span>Support Contact</span>
                <input
                  value={form.supportContact}
                  onChange={(event) => setForm({ ...form, supportContact: event.target.value })}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                <span>Active</span>
              </label>
              <label className="wide-field">
                <span>Description</span>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </label>
              <button className="primary-button" type="submit">
                <Save size={16} />
                Save
              </button>
            </form>
          </article>

          <article className="panel table-panel">
            <div className="panel-header">
              <h2>Capabilities</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Direction</th>
                    <th>Document</th>
                    <th>Transport</th>
                    <th>Format</th>
                    <th>Version</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {partner.capabilities.map((capability) => (
                    <tr key={capability.id}>
                      <td>{capability.direction}</td>
                      <td>{capability.documentType}</td>
                      <td>{capability.transport}</td>
                      <td>{capability.messageFormat}</td>
                      <td>{capability.protocolVersion ?? 'n/a'}</td>
                      <td>
                        <input
                          aria-label={`Toggle ${capability.documentType}`}
                          type="checkbox"
                          checked={capability.enabled}
                          onChange={(event) => void toggleCapability(capability.id, event.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

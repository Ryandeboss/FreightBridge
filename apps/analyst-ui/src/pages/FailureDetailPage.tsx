import { CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchErrorDetail, reopenError, resolveError, type ErrorDetailResponse } from '../api/operations';
import { PageTitle } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { BooleanBadge, StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatLongDateTime } from '../utils/dates';
import { compactId } from '../utils/formatting';

export function FailureDetailPage() {
  const { errorId = '' } = useParams();
  const { token, handleApiError } = useOperationsSession();
  const [detail, setDetail] = useState<ErrorDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'resolve' | 'reopen' | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!token || !errorId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setDetail(await fetchErrorDetail(token, errorId));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Failure detail could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [errorId, handleApiError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !dialog) {
      return;
    }
    try {
      const updated = dialog === 'resolve' ? await resolveError(token, errorId, note) : await reopenError(token, errorId);
      setDetail(updated);
      setDialog(null);
      setNote('');
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Failure update failed.');
    }
  }

  return (
    <section className="page-stack" data-testid="failure-detail-page">
      <PageTitle eyebrow="Failure detail" title={detail?.error.errorCode ?? compactId(errorId)}>
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
        {detail?.error.resolved ? (
          <button className="primary-button" type="button" onClick={() => setDialog('reopen')} data-testid="reopen-error">
            <Undo2 size={16} />
            Reopen
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={() => setDialog('resolve')} data-testid="resolve-error">
            <CheckCircle2 size={16} />
            Resolve
          </button>
        )}
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading failure" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {detail && !isLoading && (
        <>
          <article className="panel">
            <div className="detail-header">
              <div>
                <h2>{detail.error.safeMessage}</h2>
                <p>{detail.error.category} / {detail.error.stage}</p>
              </div>
              <StatusBadge value={detail.error.resolved ? 'RESOLVED' : 'OPEN'} />
            </div>
            <div className="definition-grid">
              <Definition label="Business ID" value={detail.error.businessIdentifier} />
              <Definition label="Partner" value={detail.error.partnerCode} />
              <Definition label="Document" value={detail.error.documentType} />
              <Definition label="Retryable" value={detail.error.retryable ? 'Yes' : 'No'} />
              <Definition label="Created" value={formatLongDateTime(detail.error.createdAt)} />
              <Definition label="Resolved" value={formatLongDateTime(detail.error.resolvedAt)} />
              <Definition label="Resolution note" value={detail.error.resolutionNote} />
              <Definition label="Resolved by" value={detail.error.resolvedByTransactionId} linkPrefix="/transactions/" />
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Transaction</h2>
            </div>
            <Link className="compact-row" to={`/transactions/${detail.transaction.id}`}>
              <div>
                <strong>{detail.transaction.documentType}</strong>
                <span>{detail.transaction.businessIdentifier ?? compactId(detail.transaction.id)}</span>
              </div>
              <StatusBadge value={detail.transaction.processingStatus} />
            </Link>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Related Logs</h2>
            </div>
            {!detail.logs.length ? (
              <EmptyBlock title="No related logs found" />
            ) : (
              <ol className="timeline">
                {detail.logs.map((log) => (
                  <li key={log.id}>
                    <span>{formatLongDateTime(log.createdAt)}</span>
                    <strong>{log.stage} / {log.status}</strong>
                    <p>{log.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <BooleanBadge value={detail.error.retryable} trueLabel="Retryable failure" falseLabel="Manual review" />
        </>
      )}

      {dialog && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`${dialog} failure`}>
            <h2>{dialog === 'resolve' ? 'Resolve failure' : 'Reopen failure'}</h2>
            {dialog === 'resolve' && (
              <label>
                <span>Resolution note</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
              </label>
            )}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setDialog(null)}>Cancel</button>
              <button className="primary-button" type="submit">{dialog === 'resolve' ? 'Resolve' : 'Reopen'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Definition({ label, value, linkPrefix }: { label: string; value: string | null; linkPrefix?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value && linkPrefix ? <Link to={`${linkPrefix}${value}`}>{compactId(value)}</Link> : value ?? 'None'}</dd>
    </div>
  );
}

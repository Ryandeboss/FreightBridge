import { RefreshCw, RotateCcw } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchTransactionDetail, retryTransaction, type TransactionDetailResponse } from '../api/operations';
import { PageTitle } from '../components/AppShell';
import { CopyButton } from '../components/CopyButton';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { BooleanBadge, StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatLongDateTime } from '../utils/dates';
import { compactId } from '../utils/formatting';

export function TransactionDetailPage() {
  const { transactionId = '' } = useParams();
  const { token, handleApiError } = useOperationsSession();
  const [detail, setDetail] = useState<TransactionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryNote, setRetryNote] = useState('');
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !transactionId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setDetail(await fetchTransactionDetail(token, transactionId));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Transaction detail could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, token, transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRetry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !detail) {
      return;
    }
    setRetryMessage(null);
    try {
      const result = await retryTransaction(token, detail.transaction.id, retryNote);
      setRetryMessage(`Retry ${result.status.toLowerCase()} as attempt ${result.attemptNumber ?? 'n/a'}.`);
      setRetryOpen(false);
      setRetryNote('');
      await load();
    } catch (nextError) {
      handleApiError(nextError);
      setRetryMessage(nextError instanceof ApiError ? nextError.message : 'Retry request failed.');
    }
  }

  const unresolvedRetryable = detail?.errors.some((item) => item.retryable && !item.resolved) ?? false;
  const canRetry = detail?.transaction.processingStatus === 'FAILED' && unresolvedRetryable;

  return (
    <section className="page-stack" data-testid="transaction-detail-page">
      <PageTitle eyebrow="Transaction detail" title={detail?.transaction.businessIdentifier ?? compactId(transactionId)}>
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
        {canRetry && (
          <button className="primary-button" type="button" onClick={() => setRetryOpen(true)} data-testid="retry-transaction">
            <RotateCcw size={16} />
            Retry
          </button>
        )}
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading transaction" />}
      {error && <ErrorBlock message={error} onRetry={load} />}
      {retryMessage && <p className="form-message form-info">{retryMessage}</p>}

      {detail && !isLoading && (
        <>
          <article className="panel">
            <div className="detail-header">
              <div>
                <h2>{detail.transaction.documentType} / {detail.transaction.partner.partnerCode}</h2>
                <p>{detail.transaction.partner.partnerName}</p>
              </div>
              <StatusBadge value={detail.transaction.processingStatus} />
            </div>
            <div className="definition-grid">
              <Definition label="Transaction ID" value={detail.transaction.id} copy />
              <Definition label="Correlation ID" value={detail.transaction.correlationId} copy />
              <Definition label="Direction" value={detail.transaction.direction} />
              <Definition label="Transport" value={detail.transaction.transport} />
              <Definition label="Format" value={detail.transaction.messageFormat} />
              <Definition label="Stage" value={detail.transaction.processingStage} />
              <Definition label="Replay of" value={detail.transaction.replayOfTransactionId} linkPrefix="/transactions/" />
              <Definition label="Parent" value={detail.transaction.parentTransactionId} linkPrefix="/transactions/" />
              <Definition label="Created" value={formatLongDateTime(detail.transaction.createdAt)} />
              <Definition label="Processed" value={formatLongDateTime(detail.transaction.processedAt)} />
            </div>
          </article>

          <div className="content-grid two-column">
            <article className="panel">
              <div className="panel-header">
                <h2>Timeline</h2>
              </div>
              {!detail.logs.length ? (
                <EmptyBlock title="No log entries recorded" />
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

            <article className="panel">
              <div className="panel-header">
                <h2>Errors</h2>
              </div>
              {!detail.errors.length ? (
                <EmptyBlock title="No errors for this transaction" />
              ) : (
                <div className="compact-list">
                  {detail.errors.map((item) => (
                    <Link className="compact-row" key={item.errorId} to={`/failures/${item.errorId}`}>
                      <div>
                        <strong>{item.errorCode}</strong>
                        <span>{item.safeMessage}</span>
                      </div>
                      <BooleanBadge value={item.retryable} trueLabel="Retryable" falseLabel="Not retryable" />
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </div>

          <div className="content-grid two-column">
            <RelationshipPanel title="Parent Transaction" transaction={detail.parent} />
            <article className="panel">
              <div className="panel-header">
                <h2>Child Transactions</h2>
              </div>
              {!detail.children.length ? (
                <EmptyBlock title="No child transactions" />
              ) : (
                <div className="compact-list">
                  {detail.children.map((child) => (
                    <Link className="compact-row" key={child.id} to={`/transactions/${child.id}`}>
                      <div>
                        <strong>{child.documentType}</strong>
                        <span>{child.businessIdentifier ?? compactId(child.id)}</span>
                      </div>
                      <StatusBadge value={child.processingStatus} />
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </div>

          <article className="panel">
            <div className="panel-header">
              <h2>Retry Attempts</h2>
            </div>
            {!detail.retryAttempts.length ? (
              <EmptyBlock title="No retry attempts recorded" />
            ) : (
              <div className="compact-list">
                {detail.retryAttempts.map((attempt) => (
                  <Link className="compact-row" key={attempt.id} to={`/transactions/${attempt.retryTransactionId}`}>
                    <div>
                      <strong>Attempt {attempt.attemptNumber}</strong>
                      <span>{attempt.safeMessage ?? attempt.deliveryDisposition ?? 'Retry recorded'}</span>
                    </div>
                    <StatusBadge value={attempt.status} />
                  </Link>
                ))}
              </div>
            )}
          </article>
        </>
      )}

      {retryOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submitRetry} role="dialog" aria-modal="true" aria-label="Retry transaction">
            <h2>Retry failed transaction</h2>
            <label>
              <span>Operator note</span>
              <textarea value={retryNote} onChange={(event) => setRetryNote(event.target.value)} maxLength={500} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setRetryOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit">Retry Transaction</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Definition({
  label,
  value,
  copy = false,
  linkPrefix,
}: {
  label: string;
  value: string | null;
  copy?: boolean;
  linkPrefix?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value && linkPrefix ? <Link to={`${linkPrefix}${value}`}>{compactId(value)}</Link> : <span>{value ?? 'None'}</span>}
        {copy && value && <CopyButton value={value} label={`Copy ${label}`} />}
      </dd>
    </div>
  );
}

function RelationshipPanel({ title, transaction }: { title: string; transaction: TransactionDetailResponse['parent'] }) {
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      {!transaction ? (
        <EmptyBlock title="No parent transaction" />
      ) : (
        <Link className="compact-row" to={`/transactions/${transaction.id}`}>
          <div>
            <strong>{transaction.documentType}</strong>
            <span>{transaction.businessIdentifier ?? compactId(transaction.id)}</span>
          </div>
          <StatusBadge value={transaction.processingStatus} />
        </Link>
      )}
    </article>
  );
}

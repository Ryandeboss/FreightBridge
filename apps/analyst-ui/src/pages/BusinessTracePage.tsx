import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchBusinessTrace, type BusinessTraceResponse } from '../api/operations';
import { PageTitle, SearchButton } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';
import { compactId } from '../utils/formatting';

export function TraceSearchPage() {
  const navigate = useNavigate();
  const [businessIdentifier, setBusinessIdentifier] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = businessIdentifier.trim();
    if (trimmed) {
      navigate(`/trace/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <section className="page-stack" data-testid="trace-search-page">
      <PageTitle eyebrow="Operations" title="Business Trace" />
      <article className="panel">
        <form className="trace-search" onSubmit={submit}>
          <label>
            <span>Business identifier</span>
            <input
              value={businessIdentifier}
              onChange={(event) => setBusinessIdentifier(event.target.value)}
              placeholder="LOAD..."
              autoFocus
            />
          </label>
          <SearchButton>Trace Business ID</SearchButton>
        </form>
      </article>
    </section>
  );
}

export function BusinessTraceDetailPage() {
  const { businessIdentifier = '' } = useParams();
  const { token, handleApiError } = useOperationsSession();
  const [trace, setTrace] = useState<BusinessTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !businessIdentifier) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setTrace(await fetchBusinessTrace(token, businessIdentifier));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Business trace could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [businessIdentifier, handleApiError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page-stack" data-testid="trace-detail-page">
      <PageTitle eyebrow="Business trace" title={businessIdentifier}>
        <Link className="secondary-button" to="/trace">New Trace</Link>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading business trace" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {trace && !isLoading && (
        <>
          <div className="metric-grid">
            <Metric label="Transactions" value={trace.transactionCount} />
            <Metric label="Failed" value={trace.failedTransactionCount} tone="danger" />
            <Metric label="Unresolved" value={trace.unresolvedErrorCount} tone="warning" />
          </div>

          <article className="panel">
            <div className="panel-header">
              <h2>Transaction Chain</h2>
            </div>
            {!trace.transactions.length ? (
              <EmptyBlock title="No transactions found for this business identifier" />
            ) : (
              <div className="compact-list" data-testid="trace-transactions">
                {trace.transactions.map((transaction) => (
                  <Link className="compact-row" key={transaction.id} to={`/transactions/${transaction.id}`}>
                    <div>
                      <strong>{transaction.documentType} / {transaction.partnerCode}</strong>
                      <span>{transaction.processingStage} / {formatDateTime(transaction.createdAt)}</span>
                    </div>
                    <StatusBadge value={transaction.processingStatus} />
                  </Link>
                ))}
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Relationship Links</h2>
            </div>
            {!trace.links.length ? (
              <EmptyBlock title="No parent-child links recorded" />
            ) : (
              <div className="relationship-list">
                {trace.links.map((link) => (
                  <div key={`${link.parentTransactionId}-${link.childTransactionId}`}>
                    <Link to={`/transactions/${link.parentTransactionId}`}>{compactId(link.parentTransactionId)}</Link>
                    <span>to</span>
                    <Link to={`/transactions/${link.childTransactionId}`}>{compactId(link.childTransactionId)}</Link>
                  </div>
                ))}
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

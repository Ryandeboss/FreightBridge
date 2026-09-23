import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchSystemStatus, type SystemStatus } from '../api/health';
import {
  fetchErrors,
  fetchSummary,
  fetchTransactions,
  type ErrorQueueResponse,
  type OperationalSummary,
  type TransactionSearchResponse,
} from '../api/operations';
import { PageTitle } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';
import { percent } from '../utils/formatting';

const timeframeOptions = [
  { label: '24h', value: 24 },
  { label: '72h', value: 72 },
  { label: '7d', value: 168 },
  { label: '30d', value: 720 },
];

export function DashboardPage() {
  const { token, handleApiError } = useOperationsSession();
  const [hours, setHours] = useState(24);
  const [summary, setSummary] = useState<OperationalSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionSearchResponse | null>(null);
  const [errors, setErrors] = useState<ErrorQueueResponse | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [nextSummary, nextTransactions, nextErrors, nextStatus] = await Promise.all([
        fetchSummary(token, hours),
        fetchTransactions(token, { limit: 8, offset: 0 }),
        fetchErrors(token, { resolved: false, limit: 6, offset: 0 }),
        fetchSystemStatus(),
      ]);
      setSummary(nextSummary);
      setTransactions(nextTransactions);
      setErrors(nextErrors);
      setStatus(nextStatus);
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Dashboard data could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [handleApiError, hours, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = summary?.transactionsTotal ?? 0;
  const succeeded = summary?.transactionsSucceeded ?? 0;

  return (
    <section className="page-stack" data-testid="dashboard-page">
      <PageTitle eyebrow="Operations" title="Dashboard">
        <div className="segmented-control" aria-label="Summary timeframe">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              className={hours === option.value ? 'active' : ''}
              type="button"
              onClick={() => setHours(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      {isLoading && <LoadingBlock label="Loading dashboard" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {summary && !isLoading && (
        <>
          <div className="metric-grid">
            <Metric label="Total transactions" value={summary.transactionsTotal} />
            <Metric label="Succeeded" value={summary.transactionsSucceeded} tone="success" />
            <Metric label="Failed" value={summary.transactionsFailed} tone="danger" />
            <Metric label="Unresolved errors" value={summary.unresolvedErrors} tone="warning" />
            <Metric label="Success rate" value={percent(succeeded, total)} />
          </div>

          <div className="content-grid two-column">
            <Breakdown title="Document volume" values={summary.byDocumentType} />
            <Breakdown title="Error categories" values={summary.byErrorCategory} emptyLabel="No errors in window" />
          </div>

          <div className="content-grid two-column">
            <article className="panel">
              <div className="panel-header">
                <h2>Recent Transactions</h2>
                <Link to="/transactions">View all</Link>
              </div>
              {!transactions?.transactions.length ? (
                <EmptyBlock title="No transactions found" />
              ) : (
                <div className="compact-list" data-testid="recent-transactions">
                  {transactions.transactions.map((transaction) => (
                    <Link key={transaction.id} to={`/transactions/${transaction.id}`} className="compact-row">
                      <div>
                        <strong>{transaction.businessIdentifier ?? transaction.documentType}</strong>
                        <span>{transaction.partnerCode} / {transaction.documentType}</span>
                      </div>
                      <StatusBadge value={transaction.processingStatus} />
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Recent Failures</h2>
                <Link to="/failures">Open queue</Link>
              </div>
              {!errors?.errors.length ? (
                <EmptyBlock title="No unresolved failures" detail="The queue is clear for this slice of work." />
              ) : (
                <div className="compact-list" data-testid="recent-failures">
                  {errors.errors.map((item) => (
                    <Link key={item.errorId} to={`/failures/${item.errorId}`} className="compact-row">
                      <div>
                        <strong>{item.errorCode}</strong>
                        <span>{item.businessIdentifier ?? item.stage}</span>
                      </div>
                      <StatusBadge value={item.retryable ? 'PENDING' : 'FAILED'} />
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </div>

          <article className="panel status-strip">
            <h2>System Status</h2>
            <span><span className={`status-light ${status?.api === 'online' ? 'ok' : 'error'}`} /> API</span>
            <span><span className={`status-light ${status?.database === 'connected' ? 'ok' : 'error'}`} /> Database</span>
            <span><span className={`status-light ${status?.domainSchema === 'ready' ? 'ok' : 'error'}`} /> Domain schema</span>
            <small>Generated {formatDateTime(summary.generatedAt)}</small>
          </article>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Breakdown({
  title,
  values,
  emptyLabel = 'No data in window',
}: {
  title: string;
  values: Record<string, number>;
  emptyLabel?: string;
}) {
  const entries = Object.entries(values);
  const max = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      {!entries.length ? (
        <EmptyBlock title={emptyLabel} />
      ) : (
        <div className="bar-list">
          {entries.map(([key, value]) => (
            <div className="bar-row" key={key}>
              <span>{key}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchTransactions, type TransactionFilters, type TransactionSearchResponse } from '../api/operations';
import { PageTitle, SearchButton } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';
import { compactId } from '../utils/formatting';

const limit = 25;

type TransactionFilterField = Exclude<keyof TransactionFilters, 'limit' | 'offset'>;

const filterFields: Array<{ name: TransactionFilterField; label: string; placeholder?: string }> = [
  { name: 'businessIdentifier', label: 'Business ID', placeholder: 'LOAD...' },
  { name: 'correlationId', label: 'Correlation ID' },
  { name: 'partnerCode', label: 'Partner' },
  { name: 'direction', label: 'Direction' },
  { name: 'transport', label: 'Transport' },
  { name: 'messageFormat', label: 'Format' },
  { name: 'documentType', label: 'Document Type' },
  { name: 'status', label: 'Status' },
  { name: 'stage', label: 'Stage' },
];

export function TransactionsPage() {
  const { token, handleApiError } = useOperationsSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<TransactionFilters>(() => filtersFromParams(searchParams));
  const [result, setResult] = useState<TransactionSearchResponse | null>(null);
  const [offset, setOffset] = useState(Number(searchParams.get('offset') ?? 0));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setResult(await fetchTransactions(token, { ...filters, limit, offset }));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Transactions could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, handleApiError, offset, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        next.set(key, String(value));
      }
    });
    setSearchParams(next);
  }

  function updateField(name: keyof TransactionFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  return (
    <section className="page-stack" data-testid="transactions-page">
      <PageTitle eyebrow="Operations" title="Transactions">
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      <form className="filter-grid" onSubmit={submit}>
        {filterFields.map((field) => (
          <label key={field.name}>
            <span>{field.label}</span>
            <input
              value={String(filters[field.name] ?? '')}
              placeholder={field.placeholder}
              onChange={(event) => updateField(field.name, event.target.value)}
            />
          </label>
        ))}
        <SearchButton />
      </form>

      {isLoading && <LoadingBlock label="Loading transactions" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {result && !isLoading && (
        <article className="panel table-panel">
          <div className="panel-header">
            <h2>{result.count} transactions</h2>
          </div>
          {!result.transactions.length ? (
            <EmptyBlock title="No transactions match those filters" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Partner</th>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Stage</th>
                    <th>Transport</th>
                    <th>Correlation</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {result.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <Link to={`/transactions/${transaction.id}`}>
                          {transaction.businessIdentifier ?? compactId(transaction.id)}
                        </Link>
                      </td>
                      <td>{transaction.partnerCode}</td>
                      <td>{transaction.documentType}</td>
                      <td><StatusBadge value={transaction.processingStatus} /></td>
                      <td>{transaction.processingStage}</td>
                      <td>{transaction.transport}</td>
                      <td>{compactId(transaction.correlationId)}</td>
                      <td>{formatDateTime(transaction.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            count={result.count}
            offset={offset}
            onPrevious={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
          />
        </article>
      )}
    </section>
  );
}

function Pagination({
  count,
  offset,
  onPrevious,
  onNext,
}: {
  count: number;
  offset: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pagination">
      <button className="secondary-button" type="button" disabled={offset === 0} onClick={onPrevious}>
        <ChevronLeft size={16} />
        Previous
      </button>
      <span>{offset + 1}-{Math.min(offset + limit, count)} of {count}</span>
      <button className="secondary-button" type="button" disabled={offset + limit >= count} onClick={onNext}>
        Next
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function filtersFromParams(params: URLSearchParams): Record<TransactionFilterField, string> {
  const filters = {} as Record<TransactionFilterField, string>;
  filterFields.forEach((field) => {
    const value = params.get(field.name);
    if (value) {
      filters[field.name] = value;
    }
  });
  return filters;
}

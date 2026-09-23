import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchErrors, type ErrorFilters, type ErrorQueueResponse } from '../api/operations';
import { PageTitle, SearchButton } from '../components/AppShell';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States';
import { BooleanBadge, StatusBadge } from '../components/StatusBadge';
import { useOperationsSession } from '../auth/OperationsSession';
import { formatDateTime } from '../utils/dates';

const limit = 25;

export function FailuresPage() {
  const { token, handleApiError } = useOperationsSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<ErrorFilters>(() => filtersFromParams(searchParams));
  const [offset, setOffset] = useState(Number(searchParams.get('offset') ?? 0));
  const [result, setResult] = useState<ErrorQueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setResult(await fetchErrors(token, { ...filters, limit, offset }));
    } catch (nextError) {
      handleApiError(nextError);
      setError(nextError instanceof ApiError ? nextError.message : 'Failure queue could not be loaded.');
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
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== undefined) {
        params.set(key, String(value));
      }
    });
    setSearchParams(params);
  }

  return (
    <section className="page-stack" data-testid="failures-page">
      <PageTitle eyebrow="Operations" title="Failures">
        <button className="secondary-button" type="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageTitle>

      <form className="filter-grid" onSubmit={submit}>
        <label>
          <span>Resolved</span>
          <select
            value={String(filters.resolved ?? false)}
            onChange={(event) => setFilters((current) => ({ ...current, resolved: parseMaybeBoolean(event.target.value) }))}
          >
            <option value="">Any</option>
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
          </select>
        </label>
        <label>
          <span>Retryable</span>
          <select
            value={String(filters.retryable ?? '')}
            onChange={(event) => setFilters((current) => ({ ...current, retryable: parseMaybeBoolean(event.target.value) }))}
          >
            <option value="">Any</option>
            <option value="true">Retryable</option>
            <option value="false">Not retryable</option>
          </select>
        </label>
        <FilterInput label="Business ID" value={filters.businessIdentifier} onChange={(value) => setFilters((current) => ({ ...current, businessIdentifier: value }))} />
        <FilterInput label="Partner" value={filters.partnerCode} onChange={(value) => setFilters((current) => ({ ...current, partnerCode: value }))} />
        <FilterInput label="Document Type" value={filters.documentType} onChange={(value) => setFilters((current) => ({ ...current, documentType: value }))} />
        <FilterInput label="Category" value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} />
        <FilterInput label="Error Code" value={filters.errorCode} onChange={(value) => setFilters((current) => ({ ...current, errorCode: value }))} />
        <FilterInput label="Stage" value={filters.stage} onChange={(value) => setFilters((current) => ({ ...current, stage: value }))} />
        <SearchButton />
      </form>

      {isLoading && <LoadingBlock label="Loading failure queue" />}
      {error && <ErrorBlock message={error} onRetry={load} />}

      {result && !isLoading && (
        <article className="panel table-panel">
          <div className="panel-header">
            <h2>{result.count} failures</h2>
          </div>
          {!result.errors.length ? (
            <EmptyBlock title="No failures match those filters" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Error</th>
                    <th>Business</th>
                    <th>Partner</th>
                    <th>Document</th>
                    <th>Stage</th>
                    <th>Retryable</th>
                    <th>State</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((item) => (
                    <tr key={item.errorId}>
                      <td>
                        <Link to={`/failures/${item.errorId}`}>{item.errorCode}</Link>
                        <small>{item.category}</small>
                      </td>
                      <td>{item.businessIdentifier ?? 'None'}</td>
                      <td>{item.partnerCode ?? 'None'}</td>
                      <td>{item.documentType ?? 'None'}</td>
                      <td>{item.stage}</td>
                      <td><BooleanBadge value={item.retryable} trueLabel="Retryable" falseLabel="No" /></td>
                      <td><StatusBadge value={item.resolved ? 'RESOLVED' : 'OPEN'} /></td>
                      <td>{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              <ChevronLeft size={16} />
              Previous
            </button>
            <span>{offset + 1}-{Math.min(offset + limit, result.count)} of {result.count}</span>
            <button className="secondary-button" type="button" disabled={offset + limit >= result.count} onClick={() => setOffset(offset + limit)}>
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parseMaybeBoolean(value: string): boolean | '' {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return '';
}

function filtersFromParams(params: URLSearchParams): ErrorFilters {
  return {
    resolved: parseMaybeBoolean(params.get('resolved') ?? 'false'),
    retryable: parseMaybeBoolean(params.get('retryable') ?? ''),
    businessIdentifier: params.get('businessIdentifier') ?? '',
    partnerCode: params.get('partnerCode') ?? '',
    documentType: params.get('documentType') ?? '',
    category: params.get('category') ?? '',
    errorCode: params.get('errorCode') ?? '',
    stage: params.get('stage') ?? '',
  };
}

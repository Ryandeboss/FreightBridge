import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock3,
  FileJson2,
  ListTree,
  Network,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  fetchBusinessTrace,
  fetchErrorDetail,
  fetchErrors,
  fetchTransactionDetail,
  fetchTransactions,
  type BusinessTraceResponse,
  type ErrorDetailResponse,
  type ErrorQueueResponse,
  type TransactionDetailResponse,
  type TransactionSearchResponse,
} from '../api/operations';
import {
  fetchMapping,
  fetchMappings,
  fetchPartner,
  fetchPartners,
  type MappingProfile,
  type MappingSearchResponse,
  type TradingPartner,
} from '../api/configuration';
import { useOperationsSession } from '../auth/OperationsSession';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/dates';
import { compactId } from '../utils/formatting';

const toolDefinitions = [
  {
    id: 'transactions',
    label: 'Transactions',
    icon: Search,
    when: 'Use this to find what FreightBridge actually processed for a load, partner, document, or correlation.',
  },
  {
    id: 'trace',
    label: 'Business Trace',
    icon: Network,
    when: 'Use this to follow one business identifier across the related FreightBridge transactions.',
  },
  {
    id: 'payload',
    label: 'Payload Viewer',
    icon: FileJson2,
    when: 'Use this when format, X12 controls, payload hash, or safe storage-location evidence matters.',
  },
  {
    id: 'mappings',
    label: 'Mapping Viewer',
    icon: SlidersHorizontal,
    when: 'Use this to verify which translation profile, version, settings, and rules applied.',
  },
  {
    id: 'partners',
    label: 'Partner Profile',
    icon: Building2,
    when: 'Use this to confirm the partner role, integration style, capabilities, transport, and protocol version.',
  },
  {
    id: 'errors',
    label: 'Error Detail',
    icon: AlertTriangle,
    when: 'Use this to inspect the failure FreightBridge recorded, including stage, category, and retryability.',
  },
  {
    id: 'logs',
    label: 'Processing Log',
    icon: Clock3,
    when: 'Use this to reconstruct the processing sequence and identify the last successful checkpoint.',
  },
] as const;

type ToolId = typeof toolDefinitions[number]['id'];

export function AnalystToolsPage() {
  const { tool = 'transactions' } = useParams();
  const activeTool = normalizeTool(tool);
  const definition = toolDefinitions.find((item) => item.id === activeTool) ?? toolDefinitions[0];
  const { token, handleApiError } = useOperationsSession();
  const [searchParams, setSearchParams] = useSearchParams();

  const transactionId = searchParams.get('transactionId') ?? '';
  const mappingId = searchParams.get('mappingId') ?? '';
  const partnerCode = searchParams.get('partnerCode') ?? '';
  const errorId = searchParams.get('errorId') ?? '';
  const submittedBusinessId = searchParams.get('businessId') ?? '';

  const [businessInput, setBusinessInput] = useState(submittedBusinessId);
  const [transactions, setTransactions] = useState<TransactionSearchResponse | null>(null);
  const [transactionDetail, setTransactionDetail] = useState<TransactionDetailResponse | null>(null);
  const [trace, setTrace] = useState<BusinessTraceResponse | null>(null);
  const [errors, setErrors] = useState<ErrorQueueResponse | null>(null);
  const [errorDetail, setErrorDetail] = useState<ErrorDetailResponse | null>(null);
  const [mappings, setMappings] = useState<MappingSearchResponse | null>(null);
  const [mapping, setMapping] = useState<MappingProfile | null>(null);
  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [partner, setPartner] = useState<TradingPartner | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setBusinessInput(submittedBusinessId);
  }, [submittedBusinessId]);

  useEffect(() => {
    setRawOpen(false);
  }, [activeTool, transactionId, mappingId, partnerCode, errorId]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) return;
      setLoading(true);
      setErrorMessage(null);

      try {
        if (activeTool === 'transactions') {
          const result = await fetchTransactions(token, submittedBusinessId
            ? { businessIdentifier: submittedBusinessId, limit: 25, offset: 0 }
            : { limit: 25, offset: 0 });
          if (!active) return;
          setTransactions(result);
          if (transactionId) {
            setTransactionDetail(await fetchTransactionDetail(token, transactionId));
          } else {
            setTransactionDetail(null);
          }
        } else if (activeTool === 'trace') {
          if (submittedBusinessId) {
            setTrace(await fetchBusinessTrace(token, submittedBusinessId));
          } else {
            setTrace(null);
          }
        } else if (activeTool === 'payload' || activeTool === 'logs') {
          setTransactionDetail(transactionId ? await fetchTransactionDetail(token, transactionId) : null);
        } else if (activeTool === 'mappings') {
          const result = await fetchMappings(token, { limit: 100, offset: 0 });
          if (!active) return;
          setMappings(result);
          setMapping(mappingId ? await fetchMapping(token, mappingId) : null);
        } else if (activeTool === 'partners') {
          const result = await fetchPartners(token);
          if (!active) return;
          setPartners(result);
          setPartner(partnerCode ? await fetchPartner(token, partnerCode) : null);
        } else if (activeTool === 'errors') {
          const result = await fetchErrors(token, { resolved: '', limit: 25, offset: 0 });
          if (!active) return;
          setErrors(result);
          setErrorDetail(errorId ? await fetchErrorDetail(token, errorId) : null);
        }
      } catch (nextError) {
        if (!active) return;
        handleApiError(nextError);
        setErrorMessage(nextError instanceof ApiError ? nextError.message : 'Analyst tool data could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [
    activeTool,
    token,
    submittedBusinessId,
    transactionId,
    mappingId,
    partnerCode,
    errorId,
    handleApiError,
  ]);

  function submitBusinessSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = businessInput.trim();
    const next = new URLSearchParams(searchParams);
    if (trimmed) next.set('businessId', trimmed);
    else next.delete('businessId');
    next.delete('transactionId');
    setSearchParams(next);
  }

  const selectedTransaction = transactionDetail?.transaction ?? null;
  const relatedError = transactionDetail?.errors[0] ?? null;

  return (
    <section className="analyst-tools-page" data-testid="analyst-tools-page">
      <header className="analyst-tools-header">
        <div>
          <p className="eyebrow">FreightBridge Ops Desk · Analyst Toolset</p>
          <h1>{definition.label}</h1>
          <p>{definition.when}</p>
        </div>
        <Link className="secondary-button" to={advancedConsolePath(activeTool, transactionId, mappingId, partnerCode, errorId)}>
          Open This Tool in Full Console
        </Link>
      </header>

      <nav className="analyst-tool-tabs" aria-label="Compact analyst tools">
        {toolDefinitions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className={item.id === activeTool ? 'active' : ''}
              key={item.id}
              to={toolLink(item.id, {
                businessId: submittedBusinessId,
                transactionId,
                mappingId,
                partnerCode,
                errorId,
              })}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="analyst-tool-guidance">
        <strong>When analysts use this</strong>
        <span>{definition.when}</span>
      </div>

      {loading && <article className="panel analyst-tool-state">Loading FreightBridge evidence…</article>}
      {errorMessage && <article className="panel training-alert" role="alert"><AlertTriangle size={18} /><div><strong>Tool could not load</strong><p>{errorMessage}</p></div></article>}

      {!loading && !errorMessage && activeTool === 'transactions' && (
        <TransactionsTool
          result={transactions}
          detail={transactionDetail}
          businessInput={businessInput}
          onBusinessInput={setBusinessInput}
          onSearch={submitBusinessSearch}
          businessId={submittedBusinessId}
        />
      )}

      {!loading && !errorMessage && activeTool === 'trace' && (
        <TraceTool
          trace={trace}
          businessInput={businessInput}
          onBusinessInput={setBusinessInput}
          onSearch={submitBusinessSearch}
        />
      )}

      {!loading && !errorMessage && activeTool === 'payload' && (
        <PayloadTool detail={transactionDetail} rawOpen={rawOpen} onToggleRaw={() => setRawOpen((value) => !value)} />
      )}

      {!loading && !errorMessage && activeTool === 'logs' && (
        <LogsTool detail={transactionDetail} rawOpen={rawOpen} onToggleRaw={() => setRawOpen((value) => !value)} />
      )}

      {!loading && !errorMessage && activeTool === 'mappings' && (
        <MappingsTool result={mappings} mapping={mapping} rawOpen={rawOpen} onToggleRaw={() => setRawOpen((value) => !value)} />
      )}

      {!loading && !errorMessage && activeTool === 'partners' && (
        <PartnersTool partners={partners} partner={partner} rawOpen={rawOpen} onToggleRaw={() => setRawOpen((value) => !value)} />
      )}

      {!loading && !errorMessage && activeTool === 'errors' && (
        <ErrorsTool result={errors} detail={errorDetail} rawOpen={rawOpen} onToggleRaw={() => setRawOpen((value) => !value)} />
      )}

      {selectedTransaction && (
        <aside className="analyst-context-strip" data-testid="analyst-context-strip">
          <div><span>Selected transaction</span><strong>{selectedTransaction.documentType} · {selectedTransaction.businessIdentifier ?? compactId(selectedTransaction.id)}</strong></div>
          <Link to={toolLink('payload', { transactionId: selectedTransaction.id })}>Payload<ArrowRight size={13} /></Link>
          <Link to={toolLink('logs', { transactionId: selectedTransaction.id })}>Processing Log<ArrowRight size={13} /></Link>
          {selectedTransaction.mappingProfileId && <Link to={toolLink('mappings', { mappingId: selectedTransaction.mappingProfileId })}>Mapping<ArrowRight size={13} /></Link>}
          <Link to={toolLink('partners', { partnerCode: selectedTransaction.partner.partnerCode === 'MIDWEST' ? 'MWCX' : selectedTransaction.partner.partnerCode })}>Partner<ArrowRight size={13} /></Link>
          {relatedError && <Link to={toolLink('errors', { errorId: relatedError.errorId })}>Error<ArrowRight size={13} /></Link>}
        </aside>
      )}
    </section>
  );
}

function TransactionsTool({
  result,
  detail,
  businessInput,
  onBusinessInput,
  onSearch,
  businessId,
}: {
  result: TransactionSearchResponse | null;
  detail: TransactionDetailResponse | null;
  businessInput: string;
  onBusinessInput: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  businessId: string;
}) {
  return (
    <div className="analyst-tool-grid">
      <article className="panel analyst-tool-list">
        <form className="compact-tool-search" onSubmit={onSearch}>
          <label>
            <span>Business identifier</span>
            <input value={businessInput} onChange={(event) => onBusinessInput(event.target.value)} placeholder="LOAD..." />
          </label>
          <button className="primary-button" type="submit"><Search size={15} />Search</button>
        </form>
        <div className="panel-header"><h2>{result?.count ?? 0} transactions</h2></div>
        {!result?.transactions.length ? (
          <p className="muted-text">No transactions match this search.</p>
        ) : (
          <div className="compact-tool-rows">
            {result.transactions.map((transaction) => (
              <Link
                key={transaction.id}
                to={toolLink('transactions', { businessId: businessId || transaction.businessIdentifier || '', transactionId: transaction.id })}
              >
                <span><strong>{transaction.documentType} · {transaction.partnerCode}</strong><small>{transaction.businessIdentifier ?? compactId(transaction.id)} · {transaction.transport}</small></span>
                <StatusBadge value={transaction.processingStatus} />
              </Link>
            ))}
          </div>
        )}
      </article>

      <article className="panel analyst-tool-detail" data-testid="compact-transaction-detail">
        {!detail ? (
          <>
            <p className="eyebrow">Transaction detail</p>
            <h2>Select a transaction</h2>
            <p className="muted-text">Open one result to inspect its business meaning before moving into payload, mapping, error, or log evidence.</p>
          </>
        ) : (
          <>
            <div className="panel-header">
              <div><p className="eyebrow">Transaction detail</p><h2>{detail.transaction.documentType} · {detail.transaction.partner.partnerName}</h2></div>
              <StatusBadge value={detail.transaction.processingStatus} />
            </div>
            <div className="definition-grid compact-definitions">
              <Definition label="Business ID" value={detail.transaction.businessIdentifier} />
              <Definition label="Direction" value={detail.transaction.direction} />
              <Definition label="Transport" value={detail.transaction.transport} />
              <Definition label="Format" value={detail.transaction.messageFormat} />
              <Definition label="Current stage" value={detail.transaction.processingStage} />
              <Definition label="Mapping" value={detail.transaction.mappingKey} />
              <Definition label="Correlation" value={compactId(detail.transaction.correlationId)} />
              <Definition label="Updated" value={formatDateTime(detail.transaction.updatedAt)} />
            </div>
            <div className="analyst-question">
              <ListTree size={17} />
              <div><strong>Analyst question</strong><span>What was the last successful step before the current state? Open Processing Log and prove it from FreightBridge evidence.</span></div>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

function TraceTool({
  trace,
  businessInput,
  onBusinessInput,
  onSearch,
}: {
  trace: BusinessTraceResponse | null;
  businessInput: string;
  onBusinessInput: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="analyst-tool-stack">
      <article className="panel">
        <form className="compact-tool-search" onSubmit={onSearch}>
          <label><span>Business identifier</span><input value={businessInput} onChange={(event) => onBusinessInput(event.target.value)} placeholder="LOAD..." /></label>
          <button className="primary-button" type="submit"><Network size={15} />Trace Load</button>
        </form>
      </article>
      {!trace ? (
        <article className="panel analyst-empty-tool"><h2>Trace one load end to end</h2><p>Enter the business identifier from a partner complaint or transaction search.</p></article>
      ) : (
        <article className="panel" data-testid="compact-business-trace">
          <div className="panel-header"><div><p className="eyebrow">Business trace</p><h2>{trace.businessIdentifier}</h2></div><span>{trace.transactionCount} transactions</span></div>
          <div className="metric-grid compact-metrics">
            <Metric label="Transactions" value={trace.transactionCount} />
            <Metric label="Failed" value={trace.failedTransactionCount} />
            <Metric label="Unresolved" value={trace.unresolvedErrorCount} />
          </div>
          <div className="compact-tool-rows">
            {trace.transactions.map((transaction) => (
              <Link key={transaction.id} to={toolLink('transactions', { businessId: trace.businessIdentifier, transactionId: transaction.id })}>
                <span><strong>{transaction.documentType} · {transaction.partnerCode}</strong><small>{transaction.processingStage} · {formatDateTime(transaction.createdAt)}</small></span>
                <StatusBadge value={transaction.processingStatus} />
              </Link>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

function PayloadTool({ detail, rawOpen, onToggleRaw }: { detail: TransactionDetailResponse | null; rawOpen: boolean; onToggleRaw: () => void }) {
  if (!detail) return <MissingTransaction tool="Payload Viewer" />;
  const transaction = detail.transaction;
  return (
    <article className="panel analyst-tool-detail" data-testid="compact-payload-viewer">
      <div className="panel-header">
        <div><p className="eyebrow">Payload Viewer</p><h2>{transaction.documentType} · {transaction.businessIdentifier ?? compactId(transaction.id)}</h2></div>
        <button className="secondary-button" type="button" onClick={onToggleRaw}>{rawOpen ? 'Hide Raw' : 'View Raw'}</button>
      </div>
      <p className="muted-text">The operations API exposes safe payload metadata and storage evidence, not the partner payload bytes themselves.</p>
      <div className="definition-grid compact-definitions">
        <Definition label="Partner" value={transaction.partner.partnerName} />
        <Definition label="Direction" value={transaction.direction} />
        <Definition label="Transport" value={transaction.transport} />
        <Definition label="Format" value={transaction.messageFormat} />
        <Definition label="X12 version" value={transaction.x12Version} />
        <Definition label="ISA control" value={transaction.interchangeControlNumber} />
        <Definition label="GS control" value={transaction.groupControlNumber} />
        <Definition label="ST control" value={transaction.transactionControlNumber} />
        <Definition label="Payload hash" value={transaction.payloadHash} />
        <Definition label="Raw payload location" value={transaction.rawPayloadLocation ?? 'Not exposed for this transaction'} />
      </div>
      {rawOpen && <pre className="healthy-raw" data-testid="compact-raw-evidence">{JSON.stringify(transaction, null, 2)}</pre>}
    </article>
  );
}

function LogsTool({ detail, rawOpen, onToggleRaw }: { detail: TransactionDetailResponse | null; rawOpen: boolean; onToggleRaw: () => void }) {
  if (!detail) return <MissingTransaction tool="Processing Log" />;
  return (
    <article className="panel analyst-tool-detail" data-testid="compact-processing-log">
      <div className="panel-header">
        <div><p className="eyebrow">Processing Log</p><h2>Reconstruct the FreightBridge sequence</h2></div>
        <button className="secondary-button" type="button" onClick={onToggleRaw}>{rawOpen ? 'Hide Raw' : 'View Raw'}</button>
      </div>
      <div className="analyst-question">
        <Clock3 size={17} />
        <div><strong>Question to answer from evidence</strong><span>What was the last successful checkpoint before this transaction reached its current state?</span></div>
      </div>
      {!detail.logs.length ? <p className="muted-text">No processing log entries were recorded.</p> : (
        <ol className="compact-processing-timeline">
          {detail.logs.map((log) => (
            <li key={log.id}>
              <span>{formatDateTime(log.createdAt)}</span>
              <strong>{log.stage} / {log.status}</strong>
              <p>{log.message}</p>
            </li>
          ))}
        </ol>
      )}
      {rawOpen && <pre className="healthy-raw" data-testid="compact-raw-evidence">{JSON.stringify(detail.logs, null, 2)}</pre>}
    </article>
  );
}

function MappingsTool({ result, mapping, rawOpen, onToggleRaw }: { result: MappingSearchResponse | null; mapping: MappingProfile | null; rawOpen: boolean; onToggleRaw: () => void }) {
  return (
    <div className="analyst-tool-grid">
      <article className="panel analyst-tool-list">
        <div className="panel-header"><h2>{result?.count ?? 0} mapping profiles</h2></div>
        <div className="compact-tool-rows">
          {result?.mappings.map((item) => (
            <Link key={item.id} to={toolLink('mappings', { mappingId: item.id })}>
              <span><strong>{item.mappingKey}</strong><small>{item.sourceDocumentType} → {item.targetDocumentType} · v{item.versionNumber}</small></span>
              <StatusBadge value={item.status} />
            </Link>
          ))}
        </div>
      </article>
      <article className="panel analyst-tool-detail" data-testid="compact-mapping-viewer">
        {!mapping ? <><p className="eyebrow">Mapping Viewer</p><h2>Select a profile</h2><p className="muted-text">Inspect the profile and rules without changing production-like configuration.</p></> : (
          <>
            <div className="panel-header"><div><p className="eyebrow">Mapping Viewer</p><h2>{mapping.name}</h2></div><button className="secondary-button" type="button" onClick={onToggleRaw}>{rawOpen ? 'Hide Raw' : 'View Raw'}</button></div>
            <div className="definition-grid compact-definitions">
              <Definition label="Mapping key" value={mapping.mappingKey} />
              <Definition label="Partner" value={mapping.partnerName} />
              <Definition label="Direction" value={mapping.direction} />
              <Definition label="Source" value={mapping.sourceDocumentType} />
              <Definition label="Target" value={mapping.targetDocumentType} />
              <Definition label="Version" value={'v' + mapping.versionNumber} />
              <Definition label="Status" value={mapping.status} />
              <Definition label="Validation" value={mapping.validationStatus} />
            </div>
            <div className="compact-rule-list">
              {mapping.rules.map((rule) => <div key={rule.id}><strong>{rule.sequence}. {rule.ruleKey}</strong><span>{rule.sourcePath ?? 'n/a'} → {rule.targetPath ?? 'n/a'} · {rule.transformation}</span></div>)}
            </div>
            {rawOpen && <pre className="healthy-raw" data-testid="compact-raw-evidence">{JSON.stringify({ settings: mapping.settings, rules: mapping.rules }, null, 2)}</pre>}
          </>
        )}
      </article>
    </div>
  );
}

function PartnersTool({ partners, partner, rawOpen, onToggleRaw }: { partners: TradingPartner[]; partner: TradingPartner | null; rawOpen: boolean; onToggleRaw: () => void }) {
  return (
    <div className="analyst-tool-grid">
      <article className="panel analyst-tool-list">
        <div className="panel-header"><h2>{partners.length} trading partners</h2></div>
        <div className="compact-tool-rows">
          {partners.map((item) => (
            <Link key={item.id} to={toolLink('partners', { partnerCode: item.partnerCode })}>
              <span><strong>{item.partnerCode} · {item.name}</strong><small>{item.businessRole} · {item.integrationStyle}</small></span>
              <StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'} />
            </Link>
          ))}
        </div>
      </article>
      <article className="panel analyst-tool-detail" data-testid="compact-partner-profile">
        {!partner ? <><p className="eyebrow">Partner Profile</p><h2>Select a trading partner</h2><p className="muted-text">Confirm what FreightBridge is configured to exchange with that partner.</p></> : (
          <>
            <div className="panel-header"><div><p className="eyebrow">Partner Profile</p><h2>{partner.partnerCode} · {partner.name}</h2></div><button className="secondary-button" type="button" onClick={onToggleRaw}>{rawOpen ? 'Hide Raw' : 'View Raw'}</button></div>
            <div className="definition-grid compact-definitions">
              <Definition label="Business role" value={partner.businessRole} />
              <Definition label="Integration style" value={partner.integrationStyle} />
              <Definition label="Config revision" value={String(partner.configRevision)} />
              <Definition label="Capabilities" value={partner.capabilitiesEnabled + '/' + partner.capabilitiesTotal + ' enabled'} />
            </div>
            <div className="compact-rule-list">
              {partner.capabilities.map((capability) => (
                <div key={capability.id}><strong>{capability.direction} · {capability.documentType}</strong><span>{capability.transport} · {capability.messageFormat} · {capability.protocolVersion ?? 'no version'} · {capability.enabled ? 'Enabled' : 'Disabled'}</span></div>
              ))}
            </div>
            {rawOpen && <pre className="healthy-raw" data-testid="compact-raw-evidence">{JSON.stringify(partner, null, 2)}</pre>}
          </>
        )}
      </article>
    </div>
  );
}

function ErrorsTool({ result, detail, rawOpen, onToggleRaw }: { result: ErrorQueueResponse | null; detail: ErrorDetailResponse | null; rawOpen: boolean; onToggleRaw: () => void }) {
  return (
    <div className="analyst-tool-grid">
      <article className="panel analyst-tool-list">
        <div className="panel-header"><h2>{result?.count ?? 0} recorded errors</h2></div>
        <div className="compact-tool-rows">
          {result?.errors.map((item) => (
            <Link key={item.errorId} to={toolLink('errors', { errorId: item.errorId })}>
              <span><strong>{item.errorCode}</strong><small>{item.businessIdentifier ?? 'No business ID'} · {item.stage}</small></span>
              <StatusBadge value={item.resolved ? 'RESOLVED' : 'OPEN'} />
            </Link>
          ))}
        </div>
      </article>
      <article className="panel analyst-tool-detail" data-testid="compact-error-detail">
        {!detail ? <><p className="eyebrow">Error Detail</p><h2>Select a FreightBridge error</h2><p className="muted-text">Use the recorded stage and safe message instead of guessing at partner-side internals.</p></> : (
          <>
            <div className="panel-header"><div><p className="eyebrow">Error Detail</p><h2>{detail.error.errorCode}</h2></div><button className="secondary-button" type="button" onClick={onToggleRaw}>{rawOpen ? 'Hide Raw' : 'View Raw'}</button></div>
            <p>{detail.error.safeMessage}</p>
            <div className="definition-grid compact-definitions">
              <Definition label="Business ID" value={detail.error.businessIdentifier} />
              <Definition label="Partner" value={detail.error.partnerCode} />
              <Definition label="Document" value={detail.error.documentType} />
              <Definition label="Category" value={detail.error.category} />
              <Definition label="Stage" value={detail.error.stage} />
              <Definition label="Retryable" value={detail.error.retryable ? 'Yes' : 'No'} />
              <Definition label="Resolved" value={detail.error.resolved ? 'Yes' : 'No'} />
              <Definition label="Created" value={formatDateTime(detail.error.createdAt)} />
            </div>
            <Link className="secondary-button compact-inline-action" to={toolLink('logs', { transactionId: detail.transaction.id })}>Open Processing Log<ArrowRight size={14} /></Link>
            {rawOpen && <pre className="healthy-raw" data-testid="compact-raw-evidence">{JSON.stringify(detail, null, 2)}</pre>}
          </>
        )}
      </article>
    </div>
  );
}

function MissingTransaction({ tool }: { tool: string }) {
  return (
    <article className="panel analyst-empty-tool">
      <h2>Select a transaction first</h2>
      <p>{tool} needs a specific FreightBridge transaction. Start in Transaction Search and open the transaction you are investigating.</p>
      <Link className="primary-button" to="/learn/tools/transactions">Open Transaction Search</Link>
    </article>
  );
}

function Definition({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? 'Not recorded' : String(value)}</dd></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

function normalizeTool(tool: string): ToolId {
  return toolDefinitions.some((item) => item.id === tool) ? tool as ToolId : 'transactions';
}

function toolLink(tool: ToolId, values: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return '/learn/tools/' + tool + (query ? '?' + query : '');
}

function advancedConsolePath(tool: ToolId, transactionId: string, mappingId: string, partnerCode: string, errorId: string): string {
  if ((tool === 'transactions' || tool === 'payload' || tool === 'logs') && transactionId) return '/transactions/' + transactionId;
  if (tool === 'trace') return '/trace';
  if (tool === 'mappings') return mappingId ? '/mappings/' + mappingId : '/mappings';
  if (tool === 'partners') return partnerCode ? '/partners/' + partnerCode : '/partners';
  if (tool === 'errors') return errorId ? '/failures/' + errorId : '/failures';
  return '/transactions';
}

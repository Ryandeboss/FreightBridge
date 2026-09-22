import { useEffect, useState } from 'react';
import { fetchSystemStatus, type SystemStatus } from './api/health';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const appEnv = import.meta.env.VITE_APP_ENV || 'development';

type LoadState = 'loading' | 'ready' | 'error';

const pipelineSteps = [
  {
    label: 'Apex Partner',
    detail: 'REST/JSON shipment source',
    status: 'Active',
  },
  {
    label: 'FreightBridge API',
    detail: 'Canonical logistics middleware',
    status: 'Foundation active',
  },
  {
    label: 'Midwest Carrier',
    detail: 'X12/SFTP trading partner',
    status: 'SFTP active',
  },
];

const environmentItems = [
  ['API base URL', apiBaseUrl],
  ['Application environment', appEnv],
  ['Railway/SFTPGo', 'Midwest SFTP exchange active'],
];

function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    api: 'unreachable',
    database: 'unavailable',
    domainSchema: 'unavailable',
    environment: appEnv,
  });

  useEffect(() => {
    let isMounted = true;

    fetchSystemStatus(apiBaseUrl)
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setSystemStatus(status);
        setLoadState('ready');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setSystemStatus({
          api: 'unreachable',
          database: 'unavailable',
          domainSchema: 'unavailable',
          environment: appEnv,
        });
        setLoadState('error');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isLoading = loadState === 'loading';
  const apiOnline = systemStatus.api === 'online';
  const databaseConnected = systemStatus.database === 'connected';
  const domainSchemaReady = systemStatus.domainSchema === 'ready';

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Logistics integration lab</p>
          <h1>FreightBridge</h1>
          <p className="lede">
            EDI/API logistics lab connecting Apex REST load tenders, FreightBridge
            canonical processing, and Midwest X12 SFTP exchange.
          </p>
        </div>
        <div className="status-panel" aria-label="Service status">
          <span className={`status-dot ${apiOnline ? 'ok' : 'error'}`} />
          <div>
            <p>FreightBridge API</p>
            <strong>
              {isLoading ? 'Checking...' : apiOnline ? 'Online' : 'Unreachable'}
            </strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="FreightBridge dashboard">
        <div className="panel status-summary">
          <div className="panel-header">
            <p className="eyebrow">Cloud foundation</p>
            <h2>System status</h2>
          </div>
          <div className="status-list">
            <article className="status-row">
              <span className="status-label">Analyst UI</span>
              <span className="status-value">
                <span className="mini-dot ok" />
                Online
              </span>
            </article>
            <article className="status-row">
              <span className="status-label">FreightBridge API</span>
              <span className="status-value">
                <span
                  className={`mini-dot ${
                    isLoading ? 'pending' : apiOnline ? 'ok' : 'error'
                  }`}
                />
                {isLoading ? 'Checking' : apiOnline ? 'Online' : 'Unreachable'}
              </span>
            </article>
            <article className="status-row">
              <span className="status-label">Supabase PostgreSQL</span>
              <span className="status-value">
                <span
                  className={`mini-dot ${
                    isLoading ? 'pending' : databaseConnected ? 'ok' : 'error'
                  }`}
                />
                {isLoading
                  ? 'Checking'
                  : databaseConnected
                    ? 'Connected'
                    : 'Unavailable'}
              </span>
            </article>
            <article className="status-row">
              <span className="status-label">Domain Schema</span>
              <span className="status-value">
                <span
                  className={`mini-dot ${
                    isLoading ? 'pending' : domainSchemaReady ? 'ok' : 'error'
                  }`}
                />
                {isLoading ? 'Checking' : domainSchemaReady ? 'Ready' : 'Unavailable'}
              </span>
            </article>
          </div>
          {loadState === 'error' && (
            <p className="status-note">
              The browser could not reach the configured API. Check the API URL
              and allowed origins.
            </p>
          )}
        </div>

        <div className="panel pipeline-panel">
          <div className="panel-header">
            <p className="eyebrow">Planned data flow</p>
            <h2>Partner integration path</h2>
          </div>
          <div className="pipeline">
            {pipelineSteps.map((step) => (
              <article className="pipeline-step" key={step.label}>
                <div>
                  <h3>{step.label}</h3>
                  <p>{step.detail}</p>
                </div>
                <span>{step.status}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <p className="eyebrow">Configuration</p>
            <h2>Deployment inputs</h2>
          </div>
          <dl className="config-list">
            <div>
              <dt>API readiness environment</dt>
              <dd>{isLoading ? 'Checking...' : systemStatus.environment}</dd>
            </div>
            {environmentItems.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}

export default App;

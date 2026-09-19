const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const appEnv = import.meta.env.VITE_APP_ENV || 'development';

const pipelineSteps = [
  {
    label: 'Apex Partner',
    detail: 'Future REST/JSON shipment source',
    status: 'Planned',
  },
  {
    label: 'FreightBridge API',
    detail: 'Canonical logistics middleware',
    status: 'Online foundation',
  },
  {
    label: 'Midwest Carrier',
    detail: 'Future X12/SFTP trading partner',
    status: 'Planned',
  },
];

const environmentItems = [
  ['API base URL', apiBaseUrl],
  ['Application environment', appEnv],
  ['Database', 'Supabase PostgreSQL placeholder'],
  ['SFTP', 'Railway/SFTPGo placeholder'],
];

function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Logistics integration lab</p>
          <h1>FreightBridge</h1>
          <p className="lede">
            A clean foundation for modeling partner APIs, canonical shipment
            data, and future EDI/SFTP operations.
          </p>
        </div>
        <div className="status-panel" aria-label="Service status">
          <span className="status-dot" />
          <div>
            <p>Foundation ready</p>
            <strong>FastAPI health endpoint: /health</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="FreightBridge dashboard">
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

import { Activity, AlertTriangle, BarChart3, Beaker, GitBranch, Handshake, Lock, Route, Search, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchSystemStatus, type SystemStatus } from '../api/health';
import { useOperationsSession } from '../auth/OperationsSession';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/transactions', label: 'Transactions', icon: Activity },
  { to: '/failures', label: 'Failures', icon: AlertTriangle },
  { to: '/trace', label: 'Business Trace', icon: Route },
  { to: '/lab', label: 'Integration Lab', icon: Beaker },
  { to: '/partners', label: 'Partners', icon: Handshake },
  { to: '/mappings', label: 'Mappings', icon: GitBranch },
];

export function AppShell() {
  const { lock } = useOperationsSession();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSystemStatus().then((next) => {
      if (alive) {
        setStatus(next);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const apiOnline = status?.api === 'online';

  return (
    <div className="console-layout">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p>FreightBridge</p>
            <strong>Analyst Console</strong>
          </div>
        </div>

        <nav className="side-nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-pill" data-testid="system-status">
            <span className={`status-light ${apiOnline ? 'ok' : 'error'}`} />
            <span>{apiOnline ? 'API ready' : 'API unavailable'}</span>
          </div>
          <button className="secondary-button full-width" type="button" onClick={() => lock(null)}>
            <Lock size={16} />
            Lock Console
          </button>
        </div>
      </aside>

      <header className="mobile-topbar">
        <strong>FreightBridge</strong>
        <button className="icon-button" type="button" onClick={() => lock(null)} aria-label="Lock Console">
          <Lock size={17} />
        </button>
      </header>

      <main className="console-main">
        <div className="mobile-nav" aria-label="Mobile primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="title-actions">{children}</div>}
    </div>
  );
}

export function SearchButton({ children = 'Apply Filters' }: { children?: React.ReactNode }) {
  return (
    <button className="primary-button" type="submit">
      <Search size={16} />
      {children}
    </button>
  );
}

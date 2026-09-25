import { BookOpen, Lock, ShieldCheck } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useOperationsSession } from '../../auth/OperationsSession';

export function TrainingShell() {
  const { lock } = useOperationsSession();

  return (
    <div className="training-layout">
      <header className="training-topbar">
        <Link className="training-brand" to="/learn">
          <span className="brand-mark">
            <ShieldCheck size={21} />
          </span>
          <span>
            <strong>FreightBridge</strong>
            <small>Training Mode</small>
          </span>
        </Link>
        <nav aria-label="Training navigation">
          <Link className="secondary-button" to="/dashboard">
            <BookOpen size={16} />
            Advanced Console
          </Link>
          <button className="icon-button" type="button" onClick={() => lock(null)} aria-label="Lock Console">
            <Lock size={17} />
          </button>
        </nav>
      </header>
      <main className="training-main">
        <Outlet />
      </main>
    </div>
  );
}

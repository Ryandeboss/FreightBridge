import { BookOpen, BriefcaseBusiness, GraduationCap, Lock, ShieldCheck } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useOperationsSession } from '../../auth/OperationsSession';
import { TRAINING_ROLE } from '../../training/missions';

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
            <small>{TRAINING_ROLE}</small>
          </span>
        </Link>
        <nav aria-label="Training navigation">
          <Link className="secondary-button" to="/learn">
            <GraduationCap size={16} />
            Training Desk
          </Link>
          <Link className="secondary-button" to="/learn/mission/learn-the-flow">
            <BriefcaseBusiness size={16} />
            Current Mission
          </Link>
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

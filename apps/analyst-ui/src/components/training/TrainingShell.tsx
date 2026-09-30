import {
  AlertTriangle,
  BookOpen,
  Compass,
  GraduationCap,
  Inbox,
  Lock,
  Map,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOperationsSession } from '../../auth/OperationsSession';
import { healthyWalkthroughNextPath } from '../../training/healthyWalkthrough';
import { PLANNED_MISSION_COUNT, TRAINING_ROLE } from '../../training/missions';
import { loadTrainingProgress } from '../../training/progress';

function navClass({ isActive }: { isActive: boolean }) {
  return `ops-nav-link ${isActive ? 'active' : ''}`;
}

export function TrainingShell() {
  const { lock } = useOperationsSession();
  useLocation();
  const healthyPath = healthyWalkthroughNextPath();
  const completedMissions = loadTrainingProgress().completedMissions.length;
  const trainingComplete = completedMissions >= PLANNED_MISSION_COUNT;

  return (
    <div className="ops-desk-shell" data-testid="ops-desk-shell">
      <header className="ops-topbar">
        <Link className="ops-brand" to="/learn" aria-label="FreightBridge Ops Desk">
          <span className="brand-mark"><ShieldCheck size={20} /></span>
          <span><strong>FreightBridge</strong><small>Ops Desk · Training</small></span>
        </Link>

        <div className="ops-shift-status" aria-label="Training shift status">
          <span className="ops-health-dot" aria-hidden="true" />
          <div><strong>{trainingComplete ? 'Training Complete' : 'Training Shift'}</strong><small>{trainingComplete ? '10 missions complete · review workspace' : 'Environment healthy · guided workspace'}</small></div>
        </div>

        <button className="icon-button" type="button" onClick={() => lock(null)} aria-label="Lock Console">
          <Lock size={17} />
        </button>
      </header>

      <div className="ops-workspace">
        <aside className="ops-left-rail" aria-label="FreightBridge training workspace navigation">
          <div>
            <p className="ops-rail-label">Workspace</p>
            <NavLink className={navClass} end to="/learn">
              <Inbox size={17} /><span>Inbox</span><span className="ops-nav-count">{trainingComplete ? 0 : 1}</span>
            </NavLink>
            <NavLink className={navClass} to="/learn/orientation">
              <Compass size={17} /><span>Orientation</span>
            </NavLink>
            <NavLink className={navClass} to={healthyPath}>
              <Workflow size={17} /><span>Healthy Flow</span>
            </NavLink>
            <Link className="ops-nav-link" to="/learn">
              <GraduationCap size={17} /><span>Training Desk</span>
            </Link>
          </div>

          <div>
            <p className="ops-rail-label">Analyst tools</p>
            <NavLink className={navClass} to="/learn/tools/transactions"><Search size={17} /><span>Transactions</span></NavLink>
            <NavLink className={navClass} to="/learn/tools/trace"><Network size={17} /><span>Business Trace</span></NavLink>
            <NavLink className={navClass} to="/learn/tools/errors"><AlertTriangle size={17} /><span>Errors</span></NavLink>
            <NavLink className={navClass} to="/learn/tools/mappings"><SlidersHorizontal size={17} /><span>Mappings</span></NavLink>
            <NavLink className={navClass} to="/learn/tools/partners"><Map size={17} /><span>Partners</span></NavLink>
          </div>

          <div className="ops-rail-footer">
            <Link className="ops-nav-link ops-advanced-link" to="/dashboard">
              <BookOpen size={17} /><span>Advanced Console</span>
            </Link>
            <small>Full technical workspace</small>
          </div>
        </aside>

        <main className="ops-main"><Outlet /></main>

        <aside className="ops-coach" data-testid="ops-coach" aria-label="Training coach">
          <div className="ops-coach-header">
            <div className="ops-coach-avatar">M</div>
            <div><strong>Mike</strong><small>Integration Manager</small></div>
          </div>

          <div className="ops-coach-message">
            <p className="eyebrow">How to think on shift</p>
            <p>
              Start with the business problem. Then prove what FreightBridge actually observed.
              Open raw payloads only when they answer a specific question.
            </p>
          </div>

          <ol className="ops-coach-checklist">
            <li>What is the partner claiming?</li>
            <li>Did FreightBridge receive it?</li>
            <li>What was the last healthy checkpoint?</li>
            <li>What should have happened next?</li>
            <li>Can you prove the recovery?</li>
          </ol>

          <div className="ops-coach-tip">
            <strong>Desk rule</strong>
            <span>Business meaning first → technical evidence → raw data.</span>
          </div>

          <Link className="secondary-button ops-coach-console-link" to="/dashboard">
            Open Full Console
          </Link>

          <div className="ops-role-mini">
            <span>Your role</span><strong>{TRAINING_ROLE}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}

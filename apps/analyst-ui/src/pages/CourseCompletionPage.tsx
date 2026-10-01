import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  GitBranch,
  MessageSquareText,
  Route,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useOperationsSession } from '../auth/OperationsSession';
import { PRODUCTION_INCIDENT_MISSION_ID } from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

export function CourseCompletionPage() {
  const { accountEmail } = useOperationsSession();
  const complete = hasCompletedMission(loadTrainingProgress(), PRODUCTION_INCIDENT_MISSION_ID);

  if (!complete) {
    return <Navigate to="/learn/desk" replace />;
  }

  return (
    <section className="course-completion-page" data-testid="course-completion-page">
      <article className="course-completion-hero">
        <div className="course-completion-mark"><Award size={30} /></div>
        <p className="eyebrow">FreightBridge Analyst Training · Complete</p>
        <h1>You finished the full integration-support path.</h1>
        <p>
          You followed a healthy shipment, diagnosed failures across the integration stack,
          worked an independent investigation, and closed the Final Shift with verified
          customer-facing recovery.
        </p>

        <div className="course-completion-stats" aria-label="Course completion summary">
          <span><strong>10 / 10</strong><small>Missions complete</small></span>
          <span><strong>100%</strong><small>Course progress</small></span>
          <span><strong>7</strong><small>Training modules complete</small></span>
        </div>

        {accountEmail && (
          <div className="course-completion-saved">
            <ShieldCheck size={17} />
            <span>Completion is saved to <strong>{accountEmail}</strong>.</span>
          </div>
        )}

        <div className="course-completion-actions">
          <Link className="primary-button" to="/learn/free-practice">
            Enter Free Practice <ArrowRight size={16} />
          </Link>
          <Link className="secondary-button" to="/learn/desk">Training Desk</Link>
          <Link className="secondary-button" to="/dashboard">Advanced Console</Link>
        </div>
      </article>

      <section className="course-completion-skills" aria-label="Completed analyst skills">
        <article className="panel">
          <Route size={20} />
          <div><h2>Trace</h2><p>Follow business identifiers across REST, JSON, X12, SFTP, transactions, logs, and canonical shipment state.</p></div>
        </article>
        <article className="panel">
          <GitBranch size={20} />
          <div><h2>Diagnose</h2><p>Separate authentication, transport, parsing, contract, mapping, replay, sequencing, and business-validation failures.</p></div>
        </article>
        <article className="panel">
          <Wrench size={20} />
          <div><h2>Recover</h2><p>Change only what the evidence supports, preserve valid controls and profiles, and verify the resulting behavior.</p></div>
        </article>
        <article className="panel">
          <MessageSquareText size={20} />
          <div><h2>Communicate</h2><p>State the root cause, impact, corrective action, and verification evidence in a concise production-style update.</p></div>
        </article>
      </section>

      <article className="panel course-completion-next">
        <CheckCircle2 size={22} />
        <div>
          <p className="eyebrow">Guided queue cleared</p>
          <h2>The course stops here. Practice does not.</h2>
          <p>
            Free Practice removes the curriculum gates and gives you direct access to the same
            lab, trace, transaction, failure, partner, and mapping tools used throughout training.
          </p>
        </div>
        <Link className="secondary-button" to="/learn/free-practice">Open Free Practice</Link>
      </article>
    </section>
  );
}

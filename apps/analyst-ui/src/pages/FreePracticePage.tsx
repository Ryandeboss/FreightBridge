import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Beaker,
  GitBranch,
  Handshake,
  LayoutDashboard,
  Route,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { PRODUCTION_INCIDENT_MISSION_ID } from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

const tools = [
  {
    to: '/lab',
    title: 'Integration Lab',
    description: 'Create a healthy shipment or controlled failure drill and run the integration one step at a time.',
    icon: Beaker,
  },
  {
    to: '/trace',
    title: 'Business Trace',
    description: 'Start with a business identifier and reconstruct what FreightBridge received, created, sent, and recorded.',
    icon: Route,
  },
  {
    to: '/transactions',
    title: 'Transactions',
    description: 'Search the integration ledger and inspect processing stages, controls, relationships, and retry history.',
    icon: Activity,
  },
  {
    to: '/failures',
    title: 'Failure Queue',
    description: 'Investigate unresolved integration failures without a guided evidence order or diagnosis prompt.',
    icon: AlertTriangle,
  },
  {
    to: '/partners',
    title: 'Partner Profiles',
    description: 'Review Apex and Midwest capabilities, transport expectations, and configured integration behavior.',
    icon: Handshake,
  },
  {
    to: '/mappings',
    title: 'Mapping Profiles',
    description: 'Inspect active mappings and their versions, rules, validation state, and controlled draft lifecycle.',
    icon: GitBranch,
  },
] as const;

export function FreePracticePage() {
  const complete = hasCompletedMission(loadTrainingProgress(), PRODUCTION_INCIDENT_MISSION_ID);

  if (!complete) {
    return <Navigate to="/learn/desk" replace />;
  }

  return (
    <section className="free-practice-page" data-testid="free-practice-page">
      <header className="free-practice-header">
        <div>
          <p className="eyebrow">Post-course · Free Practice</p>
          <h1>No guided path. Use the tools like an analyst.</h1>
          <p>
            The training gates are finished. Choose the evidence source that makes sense, run
            scenarios in the real Integration Lab, and build your own investigation path.
          </p>
        </div>
        <Link className="secondary-button" to="/learn/completion">View Course Completion</Link>
      </header>

      <article className="panel free-practice-start">
        <div>
          <p className="eyebrow">Recommended starting point</p>
          <h2>Generate a fresh case in the Integration Lab</h2>
          <p>
            Run a healthy lifecycle or inject a controlled failure, then move through trace,
            transactions, failures, partner configuration, and mappings without training hints.
          </p>
        </div>
        <Link className="primary-button" to="/lab">
          Open Integration Lab <ArrowRight size={16} />
        </Link>
      </article>

      <section className="free-practice-tools" aria-label="Free practice tools">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              className="free-practice-tool"
              to={tool.to}
              key={tool.to}
            >
              <span><Icon size={20} /></span>
              <div>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
              </div>
              <ArrowRight size={17} />
            </Link>
          );
        })}
      </section>

      <section className="content-grid two-column free-practice-prompts">
        <article className="panel">
          <p className="eyebrow">Practice idea 01</p>
          <h2>Healthy shipment trace</h2>
          <p>Run a full lifecycle, then explain where the 204, 997, 990, and each 214 fit in the business flow using only FreightBridge evidence.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Practice idea 02</p>
          <h2>Failure-boundary triage</h2>
          <p>Choose a failure drill, find the last successful checkpoint, and prove why downstream stages were or were not reached.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Practice idea 03</p>
          <h2>Configuration investigation</h2>
          <p>Start from a failed transaction and determine which partner profile or mapping configuration is relevant before changing anything.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Practice idea 04</p>
          <h2>Production-style handoff</h2>
          <p>Write a short incident update containing impact, root cause, corrective action, and the evidence that proves recovery.</p>
        </article>
      </section>

      <div className="free-practice-footer-actions">
        <Link className="secondary-button" to="/dashboard">
          <LayoutDashboard size={16} /> Advanced Console
        </Link>
        <Link className="secondary-button" to="/learn/desk">Training Desk</Link>
      </div>
    </section>
  );
}

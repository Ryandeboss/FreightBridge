import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Network,
  Route,
  Search,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EntityCard, LockedMarker } from '../components/training/TrainingComponents';
import {
  firstShiftIntro,
  PLANNED_MISSION_COUNT,
  TRAINING_ROLE,
  trainingEntities,
  trainingMissions,
} from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

export function TrainingHomePage() {
  const progress = loadTrainingProgress();
  const completedCount = progress.completedMissions.length;
  const currentMission = trainingMissions.find(
    (mission) => mission.implemented && isMissionUnlocked(mission.id, progress) && !hasCompletedMission(progress, mission.id),
  )
    ?? trainingMissions.find((mission) => mission.implemented && isMissionUnlocked(mission.id, progress))
    ?? trainingMissions[0];
  const currentMissionComplete = hasCompletedMission(progress, currentMission.id);

  return (
    <section className="ops-home" data-testid="training-home-page">
      <div className="ops-home-priority-grid">
        <article className="ops-welcome-card" data-testid="training-desk">
          <div className="ops-card-topline">
            <div>
              <p className="eyebrow">FreightBridge Ops Desk</p>
              <h1>Welcome to FreightBridge.</h1>
            </div>
            <span className="ops-live-badge"><CircleDot size={14} />Training</span>
          </div>

          <p className="ops-welcome-copy">
            You are the FreightBridge Integration Support Analyst. Apex and Midwest are external
            trading partners. Your job is to follow what FreightBridge received, translated, sent,
            and verified — without needing to start from raw APIs or EDI.
          </p>

          <div className="ops-role-progress-row">
            <div className="training-role-card ops-role-card" data-testid="training-role">
              <span>Your Role</span><strong>FreightBridge {TRAINING_ROLE}</strong>
            </div>
            <div className="ops-progress-tile">
              <span>Training Progress</span><strong>{completedCount} / {PLANNED_MISSION_COUNT}</strong><small>Completed missions</small>
            </div>
          </div>

          <div className="ops-primary-actions">
            <Link className="primary-button" to={`/learn/mission/${currentMission.slug}`}>
              {currentMissionComplete ? 'Review Current Mission' : 'Start Current Mission'}<ArrowRight size={16} />
            </Link>
            <Link className="secondary-button" to="/dashboard">Advanced Console</Link>
          </div>
        </article>

        <article className="ops-inbox-card" data-testid="ops-inbox">
          <div className="ops-section-heading">
            <div><p className="eyebrow">Inbox</p><h2>What needs your attention</h2></div>
            <span className="ops-count-badge">1</span>
          </div>

          <Link className="ops-inbox-item active" to={`/learn/mission/${currentMission.slug}`}>
            <span className="ops-inbox-icon"><Route size={18} /></span>
            <span><small>{currentMission.difficulty}</small><strong>{currentMission.title}</strong><span>{currentMission.summary}</span></span>
            <ArrowRight size={16} />
          </Link>

          <div className="ops-inbox-item muted">
            <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
            <span><small>System</small><strong>No other training incidents assigned</strong><span>Finish the current work before the next incident appears.</span></span>
          </div>
        </article>
      </div>

      <div className="ops-middle-grid">
        <article className="panel ops-focus-card" data-testid="ops-current-focus">
          <div className="ops-section-heading">
            <div><p className="eyebrow">Current Mission</p><h2>{currentMission.title}</h2></div>
            <span className="badge badge-info">{currentMission.difficulty}</span>
          </div>
          <p className="muted-text">{currentMission.summary}</p>
          <div className="ops-focus-sequence" aria-label="Analyst troubleshooting sequence">
            <span><strong>1</strong> Understand the business issue</span>
            <span><strong>2</strong> Inspect FreightBridge evidence</span>
            <span><strong>3</strong> Verify the outcome</span>
          </div>
          <div className="ops-manager-note">
            <div className="ops-manager-avatar">M</div>
            <div><strong>{firstShiftIntro.from}</strong><small>{firstShiftIntro.role}</small><p>{firstShiftIntro.body}</p></div>
          </div>
        </article>

        <article className="panel ops-tools-card">
          <div className="ops-section-heading">
            <div><p className="eyebrow">Your Desk</p><h2>Open technical tools when you need evidence</h2></div>
          </div>
          <div className="ops-tool-links">
            <Link to="/transactions"><Search size={18} /><span><strong>Transactions</strong><small>Find what FreightBridge processed</small></span></Link>
            <Link to="/trace"><Network size={18} /><span><strong>Business Trace</strong><small>Follow one load end to end</small></span></Link>
            <Link to="/mappings"><Wrench size={18} /><span><strong>Mappings</strong><small>See how partner data translates</small></span></Link>
          </div>
        </article>
      </div>

      <section className="ops-partner-section" aria-labelledby="ops-partner-heading">
        <div className="ops-section-heading">
          <div><p className="eyebrow">The job in one picture</p><h2 id="ops-partner-heading">Apex → FreightBridge → Midwest</h2></div>
          <small>External partner → your workplace → external partner</small>
        </div>
        <section className="entity-flow ops-partner-strip" aria-label="FreightBridge workplace and external partners">
          {trainingEntities.map((entity) => <EntityCard key={entity.name} entity={entity} />)}
        </section>
      </section>

      <section className="ops-roadmap-section" aria-labelledby="ops-roadmap-heading">
        <div className="ops-section-heading">
          <div><p className="eyebrow">Training Queue</p><h2 id="ops-roadmap-heading">Your shift roadmap</h2></div>
          <span>{completedCount} of {PLANNED_MISSION_COUNT} complete</span>
        </div>

        <section className="mission-roadmap ops-mission-strip" aria-label="Training mission roadmap" data-testid="mission-board">
          {trainingMissions.map((mission, index) => {
            const completed = hasCompletedMission(progress, mission.id);
            const unlocked = isMissionUnlocked(mission.id, progress);
            const playable = mission.implemented && unlocked;
            const comingSoon = !mission.implemented && unlocked;
            return (
              <article
                className={`mission-card ops-mission-card ${completed ? 'completed' : ''} ${!unlocked ? 'locked' : ''}`}
                key={mission.id}
                data-testid={`mission-${index + 1}-card`}
              >
                <div className="mission-card-header">
                  <span>{mission.difficulty}</span>
                  {completed && <span className="mission-complete-badge"><CheckCircle2 size={15} />Complete</span>}
                  {!playable && <LockedMarker unlocked={comingSoon} />}
                </div>
                <h2>{mission.title}</h2>
                {mission.subtitle && <p className="mission-subtitle">{mission.subtitle}</p>}
                <p>{mission.summary}</p>
                {playable ? (
                  <Link className="primary-button" to={`/learn/mission/${mission.slug}`}>
                    {completed ? 'Review Mission' : index === 0 ? 'Start Mission' : 'Open Mission'}
                  </Link>
                ) : (
                  <button className="secondary-button" type="button" disabled>
                    {comingSoon ? 'Training mission not implemented yet' : 'Locked'}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      </section>
    </section>
  );
}

function isMissionUnlocked(missionId: string, progress: ReturnType<typeof loadTrainingProgress>): boolean {
  const mission = trainingMissions.find((candidate) => candidate.id === missionId);
  if (!mission?.unlocksAfter) return true;
  return hasCompletedMission(progress, mission.unlocksAfter);
}

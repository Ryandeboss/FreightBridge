import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CommunicationMessage, EntityCard, LockedMarker } from '../components/training/TrainingComponents';
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
  const currentMission = trainingMissions.find((mission) => mission.implemented && isMissionUnlocked(mission.id, progress) && !hasCompletedMission(progress, mission.id))
    ?? trainingMissions.find((mission) => mission.implemented && isMissionUnlocked(mission.id, progress))
    ?? trainingMissions[0];
  const currentMissionComplete = hasCompletedMission(progress, currentMission.id);

  return (
    <section className="training-stack" data-testid="training-home-page">
      <article className="training-hero training-desk-hero" data-testid="training-desk">
        <p className="eyebrow">FreightBridge Training Desk</p>
        <h1>Welcome to FreightBridge.</h1>
        <p>
          You are joining the Integration Support team. Your job is to keep partner integrations
          moving, investigate FreightBridge evidence, communicate clearly, and verify recovery.
        </p>
        <div className="training-role-card" data-testid="training-role">
          <span>Your Role</span>
          <strong>FreightBridge {TRAINING_ROLE}</strong>
        </div>
        <div className="training-mode-choice">
          <Link className="training-choice primary" to={`/learn/mission/${currentMission.slug}`}>
            <span>
              <strong>Start Current Mission</strong>
              <small>{currentMission.title}{currentMission.subtitle ? `: ${currentMission.subtitle}` : ''}</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link className="training-choice" to="/dashboard">
            <span>
              <strong>Advanced Console</strong>
              <small>Open the full FreightBridge analyst toolset</small>
            </span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </article>

      <CommunicationMessage message={firstShiftIntro} />

      <section className="content-grid two-column">
        <article className="panel">
          <div className="panel-header">
            <h2>Your Role</h2>
          </div>
          <p className="muted-text">
            You work for FreightBridge, not Apex or Midwest. Training evidence is limited to what
            FreightBridge receives, sends, stores, or is told by external partner contacts.
          </p>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Training Progress</h2>
            <strong>{completedCount} / {PLANNED_MISSION_COUNT}</strong>
          </div>
          <p className="muted-text">
            Mission completion is stored only in this browser using localStorage. Operations tokens
            remain in the existing sessionStorage session model.
          </p>
        </article>
      </section>

      <section className="entity-flow" aria-label="FreightBridge workplace and external partners">
        {trainingEntities.map((entity) => (
          <EntityCard key={entity.name} entity={entity} />
        ))}
      </section>

      <section className="content-grid two-column">
        <article className="panel" data-testid="current-mission">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Current Mission</p>
              <h2>{currentMission.title}</h2>
            </div>
            <span className="badge badge-info">{currentMission.difficulty}</span>
          </div>
          <p className="muted-text">{currentMission.summary}</p>
          <div className="lab-actions">
            <Link className="primary-button" to={`/learn/mission/${currentMission.slug}`}>
              {currentMissionComplete ? 'Review Mission' : 'Start Mission'}
            </Link>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Advanced Console</h2>
          </div>
          <p className="muted-text">
            The full console is still available for dashboard, transactions, failures, business
            trace, Integration Lab, partners, and mappings.
          </p>
          <div className="lab-actions">
            <Link className="secondary-button" to="/dashboard">Open Advanced Console</Link>
          </div>
        </article>
      </section>

      <section className="mission-roadmap" aria-label="Training mission roadmap" data-testid="mission-board">
        {trainingMissions.map((mission, index) => {
          const completed = hasCompletedMission(progress, mission.id);
          const unlocked = isMissionUnlocked(mission.id, progress);
          const playable = mission.implemented && unlocked;
          const comingSoon = !mission.implemented && unlocked;
          return (
            <article
              className={`mission-card ${completed ? 'completed' : ''} ${!unlocked ? 'locked' : ''}`}
              key={mission.id}
              data-testid={`mission-${index + 1}-card`}
            >
              <div className="mission-card-header">
                <span>{mission.difficulty}</span>
                {completed && (
                  <span className="mission-complete-badge">
                    <CheckCircle2 size={15} />
                    Complete
                  </span>
                )}
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
  );
}

function isMissionUnlocked(missionId: string, progress: ReturnType<typeof loadTrainingProgress>): boolean {
  const mission = trainingMissions.find((candidate) => candidate.id === missionId);
  if (!mission?.unlocksAfter) return true;
  return hasCompletedMission(progress, mission.unlocksAfter);
}

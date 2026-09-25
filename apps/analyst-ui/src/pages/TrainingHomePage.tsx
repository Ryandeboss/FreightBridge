import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LockedMarker } from '../components/training/TrainingComponents';
import {
  LEARN_THE_FLOW_MISSION_ID,
  PLANNED_MISSION_COUNT,
  trainingMissions,
} from '../training/missions';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

export function TrainingHomePage() {
  const progress = loadTrainingProgress();
  const completedCount = progress.completedMissions.length;
  const learnTheFlowComplete = hasCompletedMission(progress, LEARN_THE_FLOW_MISSION_ID);

  return (
    <section className="training-stack" data-testid="training-home-page">
      <article className="training-hero">
        <p className="eyebrow">Training Mode</p>
        <h1>Learn EDI & API integration by doing it.</h1>
        <p>
          Follow a shipment through a broker, an integration platform, and a carrier. Then progress
          into troubleshooting real integration failures.
        </p>
        <div className="training-mode-choice">
          <Link className="training-choice primary" to="/learn/mission/learn-the-flow">
            <span>
              <strong>Training Mode</strong>
              <small>Guided lessons and missions</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link className="training-choice" to="/dashboard">
            <span>
              <strong>Advanced Console</strong>
              <small>Free exploration for analysts</small>
            </span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </article>

      <section className="content-grid two-column">
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

        <article className="panel">
          <div className="panel-header">
            <h2>What you will learn first</h2>
          </div>
          <p className="muted-text">
            Mission 1 teaches the normal Apex to FreightBridge to Midwest lifecycle before any
            troubleshooting incidents are introduced.
          </p>
        </article>
      </section>

      <section className="mission-roadmap" aria-label="Training mission roadmap">
        {trainingMissions.map((mission, index) => {
          const completed = hasCompletedMission(progress, mission.id);
          const unlockedComingSoon = mission.unlocksAfter === LEARN_THE_FLOW_MISSION_ID && learnTheFlowComplete;
          const playable = mission.implemented;
          return (
            <article className={`mission-card ${completed ? 'completed' : ''}`} key={mission.id}>
              <div className="mission-card-header">
                <span>{mission.difficulty}</span>
                {completed && (
                  <span className="mission-complete-badge">
                    <CheckCircle2 size={15} />
                    Complete
                  </span>
                )}
                {!playable && <LockedMarker unlocked={unlockedComingSoon} />}
              </div>
              <h2>{mission.title}</h2>
              <p>{mission.summary}</p>
              {playable ? (
                <Link className="primary-button" to={`/learn/mission/${mission.slug}`}>
                  {completed ? 'Review Mission' : index === 0 ? 'Start Mission' : 'Open Mission'}
                </Link>
              ) : (
                <button className="secondary-button" type="button" disabled>
                  {unlockedComingSoon ? 'Training mission not implemented yet' : 'Locked'}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </section>
  );
}

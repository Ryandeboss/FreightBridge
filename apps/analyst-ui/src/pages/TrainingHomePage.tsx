import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Compass,
  Map,
  Network,
  Repeat2,
  Route,
  Search,
  Workflow,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EntityCard, LockedMarker } from '../components/training/TrainingComponents';
import {
  firstShiftIntro,
  PLANNED_MISSION_COUNT,
  TRAINING_ROLE,
  trainingEntities,
  SFTP_STOPS_WORKING_MISSION_ID,
  trainingMissions,
} from '../training/missions';
import {
  healthyWalkthroughNextPath,
  isHealthy997990Complete,
  isHealthyApexTenderComplete,
  isHealthyMapping204Complete,
  isHealthyShipmentStatusComplete,
} from '../training/healthyWalkthrough';
import { isReplaySequencePracticeComplete } from '../training/advancedPractice';
import { isFirstDayOrientationComplete } from '../training/orientation';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

export function TrainingHomePage() {
  const progress = loadTrainingProgress();
  const completedCount = progress.completedMissions.length;
  const orientationComplete = isFirstDayOrientationComplete();
  const mission9Complete = hasCompletedMission(progress, SFTP_STOPS_WORKING_MISSION_ID);
  const replaySequenceComplete = isReplaySequencePracticeComplete();
  const healthyPart1Complete = isHealthyApexTenderComplete();
  const healthyPart2Complete = isHealthyMapping204Complete();
  const healthyPart3Complete = isHealthy997990Complete();
  const healthyPart4Complete = isHealthyShipmentStatusComplete();
  const healthyPath = healthyWalkthroughNextPath();
  const healthyTitle = !healthyPart1Complete
    ? 'Healthy Flow Part 1'
    : !healthyPart2Complete
      ? 'Healthy Flow Part 2'
      : !healthyPart3Complete
        ? 'Healthy Flow Part 3'
        : healthyPart4Complete
          ? 'Review Healthy Shipment Status'
          : 'Healthy Flow Part 4';
  const healthyAction = !healthyPart1Complete
    ? 'Start Healthy Walkthrough'
    : healthyPart4Complete
      ? 'Review Healthy Walkthrough'
      : 'Continue Healthy Walkthrough';
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
            <Link className={orientationComplete ? 'secondary-button' : 'primary-button'} to="/learn/orientation">
              <Compass size={16} />
              {orientationComplete ? 'Review First-Day Orientation' : 'Start First-Day Orientation'}
            </Link>
            {orientationComplete && (
              <Link className={healthyPart4Complete ? 'secondary-button' : 'primary-button'} to={healthyPath}>
                <Workflow size={16} />
                {healthyAction}
              </Link>
            )}
            {mission9Complete && !replaySequenceComplete ? (
              <Link className="primary-button" to="/learn/practice/replay-sequence">
                Advanced Replay & Sequence Practice<ArrowRight size={16} />
              </Link>
            ) : (
              <Link className={orientationComplete && healthyPart4Complete ? 'primary-button' : 'secondary-button'} to={`/learn/mission/${currentMission.slug}`}>
                {currentMissionComplete ? 'Review Current Mission' : 'Start Current Mission'}<ArrowRight size={16} />
              </Link>
            )}
            <Link className="secondary-button" to="/dashboard">Advanced Console</Link>
          </div>
        </article>

        <article className="ops-inbox-card" data-testid="ops-inbox">
          <div className="ops-section-heading">
            <div><p className="eyebrow">Inbox</p><h2>What needs your attention</h2></div>
            <span className="ops-count-badge">1</span>
          </div>

          {!orientationComplete ? (
            <>
              <Link className="ops-inbox-item active" to="/learn/orientation">
                <span className="ops-inbox-icon"><Compass size={18} /></span>
                <span>
                  <small>Mike · New Employee Briefing</small>
                  <strong>First-Day Orientation</strong>
                  <span>Meet the trading partners, learn the message path, and understand what FreightBridge support can actually observe.</span>
                </span>
                <ArrowRight size={16} />
              </Link>
              <div className="ops-inbox-item muted">
                <span className="ops-inbox-icon"><Route size={18} /></span>
                <span>
                  <small>Next</small>
                  <strong>{currentMission.title}</strong>
                  <span>Your first shipment walkthrough is ready after the orientation briefing.</span>
                </span>
              </div>
            </>
          ) : !healthyPart4Complete ? (
            <>
              <Link className="ops-inbox-item active" to={healthyPath}>
                <span className="ops-inbox-icon"><Workflow size={18} /></span>
                <span>
                  <small>{healthyPart1Complete ? 'Guided Healthy Flow' : 'Next'}</small>
                  <strong>{healthyTitle}</strong>
                  <span>{healthyPart3Complete
                    ? 'Follow the accepted shipment through Midwest 214 pickup, transit, arrival, delivery, and Apex-facing status updates.'
                    : healthyPart2Complete
                      ? 'Process the same saved 204 through Midwest, verify the 997 technical acknowledgment, then receive the 990 business tender decision.'
                      : healthyPart1Complete
                        ? 'Translate the same saved shipment into Midwest X12 204 before any Midwest processing happens.'
                        : 'Start with Apex REST/JSON becoming a FreightBridge canonical shipment.'}</span>
                </span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to="/learn/orientation">
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Completed Briefing</small><strong>First-Day Orientation</strong><span>Review the partner and protocol primer whenever you need it.</span></span>
              </Link>
            </>
          ) : mission9Complete && !replaySequenceComplete ? (
            <>
              <Link className="ops-inbox-item active" to="/learn/practice/replay-sequence">
                <span className="ops-inbox-icon"><Repeat2 size={18} /></span>
                <span><small>Advanced Practice</small><strong>Replay & Sequence Clinic</strong><span>Prove the difference between duplicate business attempts, exact X12 replay, and late shipment events before the final shift.</span></span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to={`/learn/mission/${currentMission.slug}`}>
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Incident Queue</small><strong>Mission 9 complete</strong><span>Your final-shift prep is now the replay and sequencing clinic.</span></span>
              </Link>
            </>
          ) : (
            <>
              <Link className="ops-inbox-item active" to={`/learn/mission/${currentMission.slug}`}>
                <span className="ops-inbox-icon"><Route size={18} /></span>
                <span><small>{currentMission.difficulty}</small><strong>{currentMission.title}</strong><span>{currentMission.summary}</span></span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to="/learn/orientation">
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Completed Briefing</small><strong>First-Day Orientation</strong><span>Review the partner and protocol primer whenever you need it.</span></span>
              </Link>
            </>
          )}
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
            <div><p className="eyebrow">Your Desk</p><h2>Investigate without leaving the workstation</h2></div>
          </div>
          <div className="ops-tool-links">
            <Link to="/learn/tools/transactions"><Search size={18} /><span><strong>Transactions</strong><small>Find what FreightBridge processed</small></span></Link>
            <Link to="/learn/tools/trace"><Network size={18} /><span><strong>Business Trace</strong><small>Follow one load end to end</small></span></Link>
            <Link to="/learn/tools/errors"><AlertTriangle size={18} /><span><strong>Errors</strong><small>Inspect recorded failure evidence</small></span></Link>
            <Link to="/learn/tools/mappings"><Wrench size={18} /><span><strong>Mappings</strong><small>Verify translation profiles</small></span></Link>
            <Link to="/learn/tools/partners"><Map size={18} /><span><strong>Partners</strong><small>Check capabilities and protocol assumptions</small></span></Link>
          </div>
        </article>
      </div>

      {orientationComplete && (
        <article className="panel healthy-home-card" data-testid="healthy-home-card">
          <div>
            <p className="eyebrow">Guided healthy flow</p>
            <h2>{!healthyPart1Complete
              ? 'Part 1 - Apex tender into FreightBridge'
              : !healthyPart2Complete
                ? 'Part 2 - Midwest 204 mapping workbench'
                : !healthyPart3Complete
                  ? 'Part 3 - 997 acknowledgment and 990 tender response'
                  : 'Part 4 - 214 shipment status and Apex updates'}</h2>
            <p>{!healthyPart1Complete
              ? 'Watch a real simulated REST/JSON tender pass authentication, parsing, validation, and canonical shipment creation.'
              : !healthyPart2Complete
                ? 'Resume the same saved Lab run, translate its canonical shipment into a Midwest X12 204, and stop at inbound SFTP delivery.'
                : !healthyPart3Complete
                  ? 'Continue the same saved run through Midwest 204 processing, the 997 technical acknowledgment, and the 990 business tender decision.'
                  : 'Continue the accepted load through Midwest 214 status messages, FreightBridge normalization, and Apex-facing shipment updates.'}</p>
          </div>
          <Link className={healthyPart4Complete ? 'secondary-button' : 'primary-button'} to={healthyPath}>
            <Workflow size={16} />
            {!healthyPart1Complete
              ? 'Start Part 1'
              : !healthyPart2Complete
                ? 'Start Part 2'
                : !healthyPart3Complete
                  ? 'Start Part 3'
                  : healthyPart4Complete
                    ? 'Review Part 4'
                    : 'Start Part 4'}
          </Link>
        </article>
      )}

      {mission9Complete && (
        <article className="panel healthy-home-card replay-practice-home-card" data-testid="replay-practice-home-card">
          <div>
            <p className="eyebrow">Advanced final-shift prep</p>
            <h2>Replay & Sequence Clinic</h2>
            <p>Use a real Lab run to distinguish duplicate business attempts, exact X12 replay suppression, and event-time chronology protection.</p>
          </div>
          <Link className={replaySequenceComplete ? 'secondary-button' : 'primary-button'} to="/learn/practice/replay-sequence">
            <Repeat2 size={16} />
            {replaySequenceComplete ? 'Review Advanced Practice' : 'Start Advanced Practice'}
          </Link>
        </article>
      )}

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

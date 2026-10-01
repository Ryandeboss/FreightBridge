import {
  ArrowRight,
  Award,
  CheckCircle2,
  CircleDot,
  Compass,
  Code2,
  Repeat2,
  Route,
  Search,
  Workflow,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EntityCard, LockedMarker } from '../components/training/TrainingComponents';
import {
  firstShiftIntro,
  PLANNED_MISSION_COUNT,
  TRAINING_ROLE,
  trainingEntities,
  PRODUCTION_INCIDENT_MISSION_ID,
  SFTP_STOPS_WORKING_MISSION_ID,
  trainingMissions,
} from '../training/missions';
import {
  healthyWalkthroughNextPath,
  isHealthyApexTenderComplete,
  isHealthyShipmentStatusComplete,
} from '../training/healthyWalkthrough';
import { isIndependentInvestigationComplete, isReplaySequencePracticeComplete } from '../training/advancedPractice';
import { isFirstDayOrientationComplete } from '../training/orientation';
import { isEdiBootcampComplete } from '../training/ediBootcamp';
import { hasCompletedMission, loadTrainingProgress } from '../training/progress';

export function TrainingHomePage() {
  const progress = loadTrainingProgress();
  const completedCount = progress.completedMissions.length;
  const orientationStoredComplete = isFirstDayOrientationComplete();
  const mission9Complete = hasCompletedMission(progress, SFTP_STOPS_WORKING_MISSION_ID);
  const replaySequenceComplete = isReplaySequencePracticeComplete();
  const finalMissionComplete = hasCompletedMission(progress, PRODUCTION_INCIDENT_MISSION_ID);
  const independentComplete = isIndependentInvestigationComplete() || finalMissionComplete;
  const trainingComplete =
    completedCount >= PLANNED_MISSION_COUNT &&
    finalMissionComplete;
  const healthyPart1Complete = isHealthyApexTenderComplete();
  const healthyPart4Complete = isHealthyShipmentStatusComplete();
  const downstreamProgress = healthyPart1Complete || completedCount > 0;
  const bootcampComplete = isEdiBootcampComplete() || downstreamProgress;
  const orientationComplete = orientationStoredComplete || bootcampComplete;
  const healthyJourneyComplete = healthyPart4Complete || completedCount > 0;
  const healthyPath = healthyWalkthroughNextPath();
  const healthyTitle = healthyJourneyComplete ? 'Review Healthy Integration Lesson' : 'Healthy Integration Lesson';
  const healthyAction = healthyJourneyComplete
    ? 'Review Healthy Integration Lesson'
    : healthyPart1Complete
      ? 'Resume Healthy Integration Lesson'
      : 'Start Healthy Integration Lesson';
  const finalMission = trainingMissions.find((mission) => mission.id === PRODUCTION_INCIDENT_MISSION_ID) ?? trainingMissions[trainingMissions.length - 1]!;
  const currentMission = trainingMissions.find(
    (mission) => mission.implemented && isMissionUnlocked(mission.id, progress) && !hasCompletedMission(progress, mission.id),
  ) ?? finalMission;
  const currentMissionComplete = hasCompletedMission(progress, currentMission.id);

  return (
    <section className="ops-home" data-testid="training-home-page">
      <div className="ops-home-priority-grid">
        <article className="ops-welcome-card" data-testid="training-desk">
          <div className="ops-card-topline">
            <div>
              <p className="eyebrow">FreightBridge Ops Desk</p>
              <h1>{trainingComplete ? 'Training complete.' : 'Welcome to FreightBridge.'}</h1>
            </div>
            <span className="ops-live-badge"><CircleDot size={14} />Training</span>
          </div>

          <p className="ops-welcome-copy">
            {trainingComplete
              ? 'You completed the FreightBridge analyst training path. The workstation now stays available for review, demos, and free-form investigation in the Advanced Console.'
              : 'You are the FreightBridge Integration Support Analyst. Apex and Midwest are external trading partners. Your job is to follow what FreightBridge received, translated, sent, and verified — without needing to start from raw APIs or EDI.'}
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
            {trainingComplete ? (
              <>
                <Link className="primary-button" to="/dashboard">
                  Open Advanced Console<ArrowRight size={16} />
                </Link>
                <Link className="secondary-button" to={`/learn/mission/${finalMission.slug}`}>
                  Review Final Shift
                </Link>
                <Link className="secondary-button" to="/learn/practice/replay-sequence">
                  Review Advanced Practice
                </Link>
              </>
            ) : (
              <>
                <Link className={orientationComplete ? 'secondary-button' : 'primary-button'} to="/learn/orientation">
                  <Compass size={16} />
                  {orientationComplete ? 'Review First-Day Orientation' : 'Start First-Day Orientation'}
                </Link>
                {orientationComplete && (
                  <Link className={bootcampComplete ? 'secondary-button' : 'primary-button'} to="/learn/bootcamp">
                    <Code2 size={16} />
                    {bootcampComplete ? 'Review EDI & Protocol Basics' : 'Start EDI & Protocol Basics'}
                  </Link>
                )}
                {bootcampComplete && (
                  <Link className={healthyJourneyComplete ? 'secondary-button' : 'primary-button'} to={healthyPath}>
                    <Workflow size={16} />
                    {healthyAction}
                  </Link>
                )}
                {healthyJourneyComplete && (
                  mission9Complete && !replaySequenceComplete ? (
                    <Link className="primary-button" to="/learn/practice/replay-sequence">
                      Advanced Replay & Sequence Practice<ArrowRight size={16} />
                    </Link>
                  ) : replaySequenceComplete && !independentComplete ? (
                    <Link className="primary-button" to="/learn/practice/independent-investigation">
                      Independent Investigation<ArrowRight size={16} />
                    </Link>
                  ) : (
                    <Link className="primary-button" to={`/learn/mission/${currentMission.slug}`}>
                      {currentMissionComplete ? 'Review Current Mission' : 'Start Current Mission'}<ArrowRight size={16} />
                    </Link>
                  )
                )}
                <Link className="secondary-button" to="/dashboard">Advanced Console</Link>
              </>
            )}
          </div>
        </article>

        <article className="ops-inbox-card" data-testid="ops-inbox">
          <div className="ops-section-heading">
            <div><p className="eyebrow">Inbox</p><h2>What needs your attention</h2></div>
            <span className="ops-count-badge">{trainingComplete ? 0 : 1}</span>
          </div>

          {trainingComplete ? (
            <>
              <div className="ops-inbox-item complete" data-testid="training-complete-inbox">
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span>
                  <small>Shift Complete</small>
                  <strong>No training incidents waiting</strong>
                  <span>All 10 missions are complete. Review any scenario or move into the Advanced Console for free-form investigation.</span>
                </span>
              </div>
              <Link className="ops-inbox-item muted" to={`/learn/mission/${finalMission.slug}`}>
                <span className="ops-inbox-icon"><Award size={18} /></span>
                <span><small>Final Shift</small><strong>{finalMission.title}</strong><span>Reopen the cumulative production-style incident whenever you want to demo the finished training path.</span></span>
                <ArrowRight size={16} />
              </Link>
            </>
          ) : !orientationComplete ? (
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
                  <strong>EDI & Protocol Basics</strong>
                  <span>Learn REST, JSON, SFTP, X12, and the 204 / 997 / 990 / 214 message roles before opening the healthy shipment.</span>
                </span>
              </div>
            </>
          ) : !bootcampComplete ? (
            <>
              <Link className="ops-inbox-item active" to="/learn/bootcamp">
                <span className="ops-inbox-icon"><Code2 size={18} /></span>
                <span>
                  <small>Module 02 · Foundations</small>
                  <strong>EDI & Protocol Basics</strong>
                  <span>Separate transport from message format, read basic REST/JSON and X12 evidence, and learn what 204, 997, 990, and 214 actually mean.</span>
                </span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to="/learn/orientation">
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Completed</small><strong>First-Day Orientation</strong><span>The three-company shipment story is complete.</span></span>
              </Link>
            </>
          ) : !healthyJourneyComplete ? (
            <>
              <Link className="ops-inbox-item active" to={healthyPath}>
                <span className="ops-inbox-icon"><Workflow size={18} /></span>
                <span>
                  <small>{healthyPart1Complete ? 'Resume baseline' : 'Next'}</small>
                  <strong>{healthyTitle}</strong>
                  <span>Follow one clean animated shipment story from Apex JSON through FreightBridge, the 204, 997/990, and 214 status updates before opening any troubleshooting tools.</span>                </span>
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
                <span><small>Advanced Practice</small><strong>Replay & Sequence Clinic</strong><span>Prove the difference between duplicate business attempts, exact X12 replay, and late shipment events before independent investigation.</span></span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to={`/learn/mission/${currentMission.slug}`}>
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Incident Queue</small><strong>Mission 9 complete</strong><span>Your next step is the replay and sequencing policy clinic.</span></span>
              </Link>
            </>
          ) : replaySequenceComplete && !independentComplete ? (
            <>
              <Link className="ops-inbox-item active" to="/learn/practice/independent-investigation">
                <span className="ops-inbox-icon"><Search size={18} /></span>
                <span><small>Module 06 · Independent</small><strong>Independent Investigation</strong><span>Choose your own evidence path, diagnose the retry failure, configure a safe correction, and prove recovery without a hint ladder.</span></span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ops-inbox-item muted" to="/learn/practice/replay-sequence">
                <span className="ops-inbox-icon"><CheckCircle2 size={18} /></span>
                <span><small>Completed</small><strong>Advanced Incidents complete</strong><span>The Final Shift unlocks after one independent case.</span></span>
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

      {trainingComplete && (
        <article className="panel training-complete-card" data-testid="training-complete-summary">
          <div className="training-complete-icon"><Award size={24} /></div>
          <div>
            <p className="eyebrow">FreightBridge Analyst Training</p>
            <h2>10 / 10 missions complete</h2>
            <p>You finished orientation, the guided healthy shipment, nine escalating incidents, the replay/sequence clinic, and the independent final shift.</p>
          </div>
          <div className="training-complete-proof">
            <span><strong>Trace</strong><small>Follow business IDs across REST, X12, SFTP, and canonical state.</small></span>
            <span><strong>Diagnose</strong><small>Separate transport, parsing, contract, mapping, replay, and business-validation failures.</small></span>
            <span><strong>Verify</strong><small>Prove recovery from FreightBridge evidence and customer-facing outcomes.</small></span>
          </div>
        </article>
      )}

      <div className="ops-middle-grid">
        <article className="panel ops-focus-card" data-testid="ops-current-focus">
          <div className="ops-section-heading">
            <div><p className="eyebrow">{trainingComplete ? 'Completed Shift' : 'Current Mission'}</p><h2>{trainingComplete ? 'Training path finished' : currentMission.title}</h2></div>
            <span className="badge badge-info">{trainingComplete ? '10 / 10' : currentMission.difficulty}</span>
          </div>
          <p className="muted-text">{trainingComplete ? 'The guided queue is complete. Use the review links or Advanced Console to revisit evidence without changing your training completion.' : currentMission.summary}</p>
          <div className="ops-focus-sequence" aria-label={trainingComplete ? 'Completed analyst skills' : 'Analyst troubleshooting sequence'}>
            {trainingComplete ? (
              <>
                <span><strong>1</strong> Trace the business flow</span>
                <span><strong>2</strong> Diagnose the failing boundary</span>
                <span><strong>3</strong> Verify recovery evidence</span>
              </>
            ) : (
              <>
                <span><strong>1</strong> Understand the business issue</span>
                <span><strong>2</strong> Inspect FreightBridge evidence</span>
                <span><strong>3</strong> Verify the outcome</span>
              </>
            )}
          </div>
          <div className="ops-manager-note">
            <div className="ops-manager-avatar">M</div>
            <div>
              <strong>{firstShiftIntro.from}</strong><small>{firstShiftIntro.role}</small>
              <p>{trainingComplete ? 'Nice work. The queue is clear. You can now use the same evidence-first workflow independently in the Advanced Console.' : firstShiftIntro.body}</p>
            </div>
          </div>
        </article>

      </div>

      {bootcampComplete && (
        <article className="panel healthy-home-card" data-testid="healthy-home-card">
          <div>
            <p className="eyebrow">Module 03 · Healthy integration</p>
            <h2>Healthy Integration Lesson</h2>
            <p>Learn the normal message flow through five minimal animated scenes. No debugging tools or live Lab run are needed yet.</p>
          </div>
          <Link className={healthyJourneyComplete ? 'secondary-button' : 'primary-button'} to={healthyPath}>
            <Workflow size={16} />
            {healthyAction}
          </Link>
        </article>
      )}

      {mission9Complete && (
        <article className="panel healthy-home-card replay-practice-home-card" data-testid="replay-practice-home-card">
          <div>
            <p className="eyebrow">Module 05 · Advanced policy clinic</p>
            <h2>Replay & Sequence Policy Lab</h2>
            <p>Use the same Console, Code, and Answer workstation to inspect replay evidence, configure safe duplicate/replay/chronology policy, and prove the resulting behavior.</p>
          </div>
          <Link className={replaySequenceComplete ? 'secondary-button' : 'primary-button'} to="/learn/practice/replay-sequence">
            <Repeat2 size={16} />
            {replaySequenceComplete ? 'Review Advanced Practice' : 'Start Advanced Practice'}
          </Link>
        </article>
      )}

      {replaySequenceComplete && (
        <article className="panel healthy-home-card independent-practice-home-card" data-testid="independent-practice-home-card">
          <div>
            <p className="eyebrow">Module 06 · Independent investigation</p>
            <h2>Work a case without the guided path</h2>
            <p>Use Console, Code, and Answer without required evidence clicks, checkpoint prompts, or hints. Your result must prove a safe idempotent recovery before Final Shift unlocks.</p>
          </div>
          <Link className={independentComplete ? 'secondary-button' : 'primary-button'} to="/learn/practice/independent-investigation">
            <Search size={16} />
            {independentComplete ? 'Review Independent Investigation' : 'Start Independent Investigation'}
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
  if (
    missionId === PRODUCTION_INCIDENT_MISSION_ID
    && !isIndependentInvestigationComplete()
    && !hasCompletedMission(progress, PRODUCTION_INCIDENT_MISSION_ID)
  ) return false;
  const mission = trainingMissions.find((candidate) => candidate.id === missionId);
  if (!mission?.unlocksAfter) return true;
  return hasCompletedMission(progress, mission.unlocksAfter);
}

import {
  BookOpen,
  Code2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flag,
  Lock,
  Route,
  Search,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useOperationsSession } from '../../auth/OperationsSession';
import {
  healthyWalkthroughNextPath,
  isHealthy997990Complete,
  isHealthyApexTenderComplete,
  isHealthyMapping204Complete,
  isHealthyShipmentStatusComplete,
} from '../../training/healthyWalkthrough';
import {
  APEX_BAD_AUTH_MISSION_ID,
  APEX_INVALID_CONTRACT_MISSION_ID,
  APEX_INVALID_JSON_MISSION_ID,
  DUPLICATE_SHIPMENT_MISSION_ID,
  LEARN_THE_FLOW_MISSION_ID,
  PRODUCTION_INCIDENT_MISSION_ID,
  SFTP_STOPS_WORKING_MISSION_ID,
  STATUS_CALLBACK_MISSING_MISSION_ID,
  WRONG_X12_VERSION_MISSION_ID,
  X12_ENVELOPE_MISMATCH_MISSION_ID,
  trainingMissions,
} from '../../training/missions';
import { isFirstDayOrientationComplete } from '../../training/orientation';
import {
  EDI_BOOTCAMP_LESSON_COUNT,
  isEdiBootcampComplete,
  loadEdiBootcampState,
} from '../../training/ediBootcamp';
import { isIndependentInvestigationComplete, isReplaySequencePracticeComplete } from '../../training/advancedPractice';
import { HEALTHY_LESSON_SCENE_COUNT, loadHealthyLessonState } from '../../training/healthyLesson';
import { hasCompletedMission, loadTrainingProgress } from '../../training/progress';

const SIDEBAR_STORAGE_KEY = 'freightbridge.curriculumSidebarCollapsed';
const GUIDED_MISSION_IDS = [
  APEX_BAD_AUTH_MISSION_ID,
  APEX_INVALID_JSON_MISSION_ID,
  APEX_INVALID_CONTRACT_MISSION_ID,
  DUPLICATE_SHIPMENT_MISSION_ID,
  X12_ENVELOPE_MISMATCH_MISSION_ID,
  STATUS_CALLBACK_MISSING_MISSION_ID,
] as const;
const ADVANCED_MISSION_IDS = [
  WRONG_X12_VERSION_MISSION_ID,
  SFTP_STOPS_WORKING_MISSION_ID,
] as const;

export type TrainingOutletContext = {
  setOrientationScene: (scene: number) => void;
  setBootcampLesson: (lesson: number) => void;
  setHealthyScene: (scene: number) => void;
};

function missionPath(missionId: string): string {
  const mission = trainingMissions.find((candidate) => candidate.id === missionId);
  return mission ? `/learn/mission/${mission.slug}` : '/learn/desk';
}

function firstIncompleteMissionPath(ids: readonly string[], completed: (id: string) => boolean): string {
  const next = ids.find((id) => !completed(id)) ?? ids[ids.length - 1];
  return missionPath(next);
}

function percent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function TrainingShell() {
  const { lock } = useOperationsSession();
  const location = useLocation();
  const [orientationScene, setOrientationScene] = useState(1);
  const [bootcampLesson, setBootcampLesson] = useState(() => loadEdiBootcampState().lesson);
  const [healthyScene, setHealthyScene] = useState(() => loadHealthyLessonState().scene);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  );

  const progress = loadTrainingProgress();
  const completed = (missionId: string) => hasCompletedMission(progress, missionId);

  // Progress is monotonic for the curriculum UI. Older browser state may contain
  // later mission completions without the newer orientation/healthy-flow keys.
  // Downstream work therefore implies that prerequisite course modules were completed.
  const orientationStoredComplete = isFirstDayOrientationComplete();
  const bootcampState = loadEdiBootcampState();
  const healthyParts = [
    isHealthyApexTenderComplete(),
    isHealthyMapping204Complete(),
    isHealthy997990Complete(),
    isHealthyShipmentStatusComplete(),
  ].filter(Boolean).length;
  const healthyMissionComplete = completed(LEARN_THE_FLOW_MISSION_ID);
  const rawHealthyCompletedUnits = healthyParts + (healthyMissionComplete ? 1 : 0);
  const rawGuidedCompleted = GUIDED_MISSION_IDS.filter(completed).length;
  const replayComplete = isReplaySequencePracticeComplete();
  const advancedMissionCompleted = ADVANCED_MISSION_IDS.filter(completed).length;
  const rawAdvancedCompletedUnits = advancedMissionCompleted + (replayComplete ? 1 : 0);
  const finalComplete = completed(PRODUCTION_INCIDENT_MISSION_ID);
  const independentStoredComplete = isIndependentInvestigationComplete();
  const independentComplete = independentStoredComplete || finalComplete;

  const independentHasProgress = independentComplete || finalComplete;
  const advancedHasProgress = rawAdvancedCompletedUnits > 0 || independentHasProgress;
  const guidedHasProgress = rawGuidedCompleted > 0 || advancedHasProgress;
  const healthyHasProgress = rawHealthyCompletedUnits > 0 || guidedHasProgress;
  const bootcampHasProgress = bootcampState.lesson > 1 || bootcampState.complete || healthyHasProgress;

  const bootcampComplete = isEdiBootcampComplete() || healthyHasProgress;
  const orientationComplete = orientationStoredComplete || bootcampHasProgress;
  const bootcampCompletedUnits = bootcampComplete
    ? EDI_BOOTCAMP_LESSON_COUNT
    : Math.max(0, Math.min(EDI_BOOTCAMP_LESSON_COUNT - 1, bootcampLesson - 1));
  const healthySceneCompletedUnits = Math.max(0, Math.min(HEALTHY_LESSON_SCENE_COUNT - 1, healthyScene - 1));
  const healthyCompletedUnits = healthyMissionComplete || guidedHasProgress
    ? 5
    : Math.max(rawHealthyCompletedUnits, healthySceneCompletedUnits);
  const healthyComplete = healthyCompletedUnits >= 5;
  const guidedCompleted = advancedHasProgress ? GUIDED_MISSION_IDS.length : rawGuidedCompleted;
  const guidedComplete = guidedCompleted === GUIDED_MISSION_IDS.length;
  const advancedCompletedUnits = independentHasProgress ? 3 : rawAdvancedCompletedUnits;
  const advancedComplete = advancedCompletedUnits >= 3;

  const healthyPath = healthyWalkthroughNextPath();
  const healthyModulePath = healthyPath;
  const guidedPath = missionPath(APEX_BAD_AUTH_MISSION_ID);
  const advancedPath = advancedMissionCompleted < ADVANCED_MISSION_IDS.length
    ? firstIncompleteMissionPath(ADVANCED_MISSION_IDS, completed)
    : '/learn/practice/replay-sequence';
  const independentPath = '/learn/practice/independent-investigation';
  const finalPath = missionPath(PRODUCTION_INCIDENT_MISSION_ID);

  const finalHasProgress = finalComplete;

  const modules = [
    {
      id: 'orientation',
      number: '01',
      title: 'Orientation',
      description: 'Companies, shipment lifecycle, and your role',
      icon: Compass,
      to: '/learn/orientation',
      unlocked: true,
      progress: orientationComplete ? 100 : Math.round((Math.min(Math.max(orientationScene, 1), 6) / 6) * 100),
      meta: orientationComplete ? 'Complete' : `Scene ${orientationScene} of 6`,
    },
    {
      id: 'bootcamp',
      number: '02',
      title: 'EDI & Protocol Basics',
      description: 'REST, JSON, SFTP, X12, envelopes, and core documents',
      icon: Code2,
      to: '/learn/bootcamp',
      unlocked: orientationComplete || bootcampHasProgress,
      progress: bootcampComplete ? 100 : percent(bootcampCompletedUnits, EDI_BOOTCAMP_LESSON_COUNT),
      meta: bootcampComplete ? 'Complete' : `Lesson ${bootcampLesson} of ${EDI_BOOTCAMP_LESSON_COUNT}`,
    },
    {
      id: 'healthy',
      number: '03',
      title: 'Healthy Integration',
      description: 'See a normal shipment before debugging failures',
      icon: Workflow,
      to: healthyModulePath,
      unlocked: bootcampComplete || healthyCompletedUnits > 0,
      progress: percent(healthyCompletedUnits, 5),
      meta: healthyComplete ? 'Complete' : `Scene ${Math.min(healthyScene, HEALTHY_LESSON_SCENE_COUNT)} of ${HEALTHY_LESSON_SCENE_COUNT}`,
    },
    {
      id: 'guided',
      number: '04',
      title: 'Guided Troubleshooting',
      description: 'Authentication, parsing, contracts, replay, and mapping',
      icon: Route,
      to: guidedPath,
      unlocked: healthyComplete || guidedHasProgress,
      progress: percent(guidedCompleted, GUIDED_MISSION_IDS.length),
      meta: guidedComplete ? 'Complete' : `${guidedCompleted} of ${GUIDED_MISSION_IDS.length} labs`,
    },
    {
      id: 'advanced',
      number: '05',
      title: 'Advanced Incidents',
      description: 'Profiles, SFTP trust, replay, and sequencing',
      icon: BookOpen,
      to: advancedPath,
      unlocked: guidedComplete || advancedHasProgress,
      progress: percent(advancedCompletedUnits, 3),
      meta: advancedComplete ? 'Complete' : `${advancedCompletedUnits} of 3 labs`,
    },
    {
      id: 'independent',
      number: '06',
      title: 'Independent Investigation',
      description: 'Choose your own evidence path and prove a safe recovery',
      icon: Search,
      to: independentPath,
      unlocked: advancedComplete || independentHasProgress,
      progress: independentComplete ? 100 : 0,
      meta: independentComplete ? 'Complete' : '1 independent case',
    },
    {
      id: 'final',
      number: '07',
      title: 'Final Shift',
      description: 'Solve a production-style incident independently',
      icon: Flag,
      to: finalPath,
      unlocked: independentComplete || finalHasProgress,
      progress: finalComplete ? 100 : 0,
      meta: finalComplete ? 'Complete' : '1 final incident',
    },
  ] as const;

  const totalCompletedUnits =
    (orientationComplete ? 1 : 0)
    + bootcampCompletedUnits
    + healthyCompletedUnits
    + guidedCompleted
    + advancedCompletedUnits
    + (independentComplete ? 1 : 0)
    + (finalComplete ? 1 : 0);
  const totalUnits = 1 + EDI_BOOTCAMP_LESSON_COUNT + 5 + GUIDED_MISSION_IDS.length + 3 + 1 + 1;
  const courseProgress = percent(totalCompletedUnits, totalUnits);

  const pathname = location.pathname;
  let activeModuleId = modules.find((module) => module.unlocked && module.progress < 100)?.id ?? 'final';
  if (pathname.startsWith('/learn/orientation')) activeModuleId = 'orientation';
  else if (pathname.startsWith('/learn/bootcamp')) activeModuleId = 'bootcamp';
  else if (pathname.startsWith('/learn/healthy') || pathname.includes('/mission/learn-the-flow')) activeModuleId = 'healthy';
  else if (pathname.startsWith('/learn/practice/replay-sequence')) activeModuleId = 'advanced';
  else if (pathname.startsWith('/learn/practice/independent-investigation')) activeModuleId = 'independent';
  else if (pathname.startsWith('/learn/mission/')) {
    const slug = pathname.split('/').pop();
    const mission = trainingMissions.find((candidate) => candidate.slug === slug);
    if (mission && GUIDED_MISSION_IDS.includes(mission.id as (typeof GUIDED_MISSION_IDS)[number])) activeModuleId = 'guided';
    else if (mission && ADVANCED_MISSION_IDS.includes(mission.id as (typeof ADVANCED_MISSION_IDS)[number])) activeModuleId = 'advanced';
    else if (mission?.id === PRODUCTION_INCIDENT_MISSION_ID) activeModuleId = 'final';
  }

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div
      className={`course-shell ${collapsed ? 'sidebar-collapsed' : ''}`}
      data-testid="ops-desk-shell"
      data-course-shell
    >
      <aside className="course-sidebar" data-testid="curriculum-sidebar" aria-label="FreightBridge course modules">
        <div className="course-sidebar-head">
          <Link className="course-brand" to="/learn/desk" aria-label="FreightBridge learning home">
            <span><ShieldCheck size={20} /></span>
            <span className="course-sidebar-head-copy"><strong>FreightBridge</strong><small>Training Course</small></span>
          </Link>
          <button
            className="course-collapse-button"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand course outline' : 'Collapse course outline'}
            title={collapsed ? 'Expand course outline' : 'Collapse course outline'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="course-sidebar-progress" data-testid="curriculum-progress">
          <div><span>Course progress</span><strong>{courseProgress}%</strong></div>
          <div className="course-progress-track" aria-hidden="true"><span style={{ width: `${courseProgress}%` }} /></div>
        </div>

        <nav className="course-module-list" aria-label="Course outline">
          {modules.map((module) => {
            const Icon = module.icon;
            const active = module.id === activeModuleId;
            const complete = module.progress === 100;
            const className = `course-module ${active ? 'active' : ''} ${complete ? 'complete' : ''} ${!module.unlocked ? 'locked' : ''}`;
            const body = (
              <>
                <span className="course-module-number">{complete ? <CheckCircle2 size={18} /> : module.number}</span>
                <span className="course-module-copy">
                  <span className="course-module-title"><Icon size={15} />{module.title}</span>
                  <small>{module.description}</small>
                  <span className="course-module-meta">{module.unlocked ? module.meta : 'Locked'}</span>
                  <span className="course-module-progress" aria-hidden="true"><span style={{ width: `${module.progress}%` }} /></span>
                </span>
              </>
            );

            return module.unlocked ? (
              <Link
                key={module.id}
                className={className}
                to={module.to}
                data-testid={`curriculum-module-${module.id}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? module.title : undefined}
              >
                {body}
              </Link>
            ) : (
              <div
                key={module.id}
                className={className}
                data-testid={`curriculum-module-${module.id}`}
                aria-disabled="true"
                title={collapsed ? `${module.title} · Locked` : undefined}
              >
                {body}
              </div>
            );
          })}
        </nav>

        <div className="course-sidebar-footer">
          <Link className="course-advanced-link" to="/dashboard" title={collapsed ? 'Advanced Console' : undefined}>
            <BookOpen size={17} />
            <span className="course-sidebar-head-copy"><strong>Advanced Console</strong><small>Full technical workspace</small></span>
          </Link>
        </div>
      </aside>

      <header className="course-topbar">
        <div>
          <small>Current module</small>
          <strong>{modules.find((module) => module.id === activeModuleId)?.title ?? 'Training'}</strong>
        </div>
        <button className="icon-button" type="button" onClick={() => lock(null)} aria-label="Lock Console">
          <Lock size={17} />
        </button>
      </header>

      <main className="course-main">
        <Outlet context={{ setOrientationScene, setBootcampLesson, setHealthyScene }} />
      </main>
    </div>
  );
}

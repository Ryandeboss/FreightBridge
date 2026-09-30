import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  FileJson2,
  FileText,
  Server,
  Sparkles,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { TrainingOutletContext } from '../components/training/TrainingShell';
import {
  completeHealthyLesson,
  HEALTHY_LESSON_SCENE_COUNT,
  loadHealthyLessonState,
  saveHealthyLessonScene,
} from '../training/healthyLesson';
import { LEARN_THE_FLOW_MISSION_ID } from '../training/missions';
import { completeMission, hasCompletedMission, loadTrainingProgress } from '../training/progress';

type ConsoleLine = {
  text: string;
  emphasis?: boolean;
  quiet?: boolean;
};

const apexJson: ConsoleLine[] = [
  { text: 'POST /api/integrations/apex/load-tenders', emphasis: true },
  { text: 'Content-Type: application/json', quiet: true },
  { text: 'Authorization: Bearer ••••••••', quiet: true },
  { text: '' },
  { text: '{' },
  { text: '  "loadId": "LOAD500",', emphasis: true },
  { text: '  "bolNumber": "BOL900",' },
  { text: '  "purchaseOrderNumber": "PO111",' },
  { text: '  "equipmentType": "VAN_53",' },
  { text: '  "weightLbs": 42000,' },
  { text: '  "pickup": "ABC Factory · Aurora, IL",' },
  { text: '  "delivery": "XYZ Warehouse · Detroit, MI"' },
  { text: '}' },
];

const canonicalJson: ConsoleLine[] = [
  { text: 'INBOUND  Apex JSON                              ✓', quiet: true },
  { text: 'AUTH     Bearer credential                      ✓', quiet: true },
  { text: 'PARSE    JSON                                   ✓', quiet: true },
  { text: 'VALIDATE Apex load-tender contract              ✓', quiet: true },
  { text: '' },
  { text: 'CANONICAL SHIPMENT', emphasis: true },
  { text: 'shipmentNumber: LOAD500', emphasis: true },
  { text: 'BOL: BOL900 · PO: PO111' },
  { text: 'origin: Aurora, IL' },
  { text: 'destination: Detroit, MI' },
  { text: 'weightLbs: 42000' },
];

const x12Tender: ConsoleLine[] = [
  { text: 'ISA*00*...*ZZ*FREIGHTBRIDGE*ZZ*MWCX*...*00401*...~', quiet: true },
  { text: 'GS*SM*FREIGHTBRIDGE*MWCX*...*004010~', quiet: true },
  { text: 'ST*204*0001~', emphasis: true },
  { text: 'B2**MWCX**LOAD500**PP~', emphasis: true },
  { text: 'L11*BOL900*BM~' },
  { text: 'L11*PO111*PO~' },
  { text: 'S5*1*LD~' },
  { text: 'N1*SH*ABC Factory~' },
  { text: 'N4*Aurora*IL*60505~' },
  { text: 'S5*2*UL~' },
  { text: 'N1*CN*XYZ Warehouse~' },
  { text: 'N4*Detroit*MI*48201~' },
  { text: 'SE*...*0001~', quiet: true },
];

const responses: ConsoleLine[] = [
  { text: 'Midwest → FreightBridge', quiet: true },
  { text: '' },
  { text: '997 FUNCTIONAL ACKNOWLEDGMENT', emphasis: true },
  { text: 'AK5*A~   // transaction accepted technically' },
  { text: 'AK9*A~   // group accepted technically' },
  { text: '' },
  { text: '990 TENDER RESPONSE', emphasis: true },
  { text: 'B1*MWCX*LOAD500*...*A~' },
  { text: 'A = carrier accepted the load', emphasis: true },
];

const statuses: ConsoleLine[] = [
  { text: '214 STATUS MAPPING', emphasis: true },
  { text: '' },
  { text: 'AF  →  PICKED_UP', emphasis: true },
  { text: 'X6  →  IN_TRANSIT', emphasis: true },
  { text: 'X1  →  ARRIVED', emphasis: true },
  { text: 'D1  →  DELIVERED', emphasis: true },
  { text: '' },
  { text: 'FreightBridge currentStatus: DELIVERED' },
  { text: 'Apex-facing shipment update: DELIVERED ✓', quiet: true },
];

export function HealthyIntegrationLessonPage() {
  const { setHealthyScene } = useOutletContext<TrainingOutletContext>();
  const stored = useMemo(() => loadHealthyLessonState(), []);
  const missionComplete = hasCompletedMission(loadTrainingProgress(), LEARN_THE_FLOW_MISSION_ID);
  const [scene, setScene] = useState(stored.complete || missionComplete ? 1 : stored.scene);
  const [complete, setComplete] = useState(stored.complete || missionComplete);

  useEffect(() => {
    setHealthyScene(scene);
    if (!complete) saveHealthyLessonScene(scene);
  }, [complete, scene, setHealthyScene]);

  function previous() {
    setScene((current) => Math.max(1, current - 1));
  }

  function next() {
    setScene((current) => Math.min(HEALTHY_LESSON_SCENE_COUNT, current + 1));
  }

  function finish() {
    completeHealthyLesson();
    completeMission(LEARN_THE_FLOW_MISSION_ID);
    setComplete(true);
    setHealthyScene(HEALTHY_LESSON_SCENE_COUNT + 1);
  }

  return (
    <section className="healthy-story-page" data-testid="healthy-lesson-page">
      <header className="healthy-story-header">
        <div>
          <span>Module 03 · Healthy Integration</span>
          <strong>Scene {scene} of {HEALTHY_LESSON_SCENE_COUNT}</strong>
        </div>
        <div className="healthy-story-progress" aria-label={'Healthy integration scene ' + scene + ' of ' + HEALTHY_LESSON_SCENE_COUNT}>
          {Array.from({ length: HEALTHY_LESSON_SCENE_COUNT }, (_, index) => (
            <span
              key={index}
              className={index + 1 < scene ? 'complete' : index + 1 === scene ? 'current' : ''}
              aria-hidden="true"
            />
          ))}
        </div>
      </header>

      <main className="healthy-story-stage">
        {scene === 1 && <TenderArrivalScene />}
        {scene === 2 && <CanonicalScene />}
        {scene === 3 && <Tender204Scene />}
        {scene === 4 && <AcknowledgmentScene />}
        {scene === 5 && <ShipmentStatusScene complete={complete} />}
      </main>

      <footer className="healthy-story-actions">
        <button className="story-button story-button-secondary" type="button" onClick={previous} disabled={scene === 1}>
          <ArrowLeft size={17} /> Back
        </button>
        <span>{complete ? 'Healthy flow lesson complete' : 'One idea at a time.'}</span>
        {scene < HEALTHY_LESSON_SCENE_COUNT ? (
          <button className="story-button story-button-primary" type="button" onClick={next}>
            Continue <ArrowRight size={17} />
          </button>
        ) : complete ? (
          <Link className="story-button story-button-primary" to="/learn/mission/apex-bad-auth">
            Start Troubleshooting <ArrowRight size={17} />
          </Link>
        ) : (
          <button className="story-button story-button-primary" type="button" onClick={finish}>
            Finish Healthy Flow <CheckCircle2 size={17} />
          </button>
        )}
      </footer>
    </section>
  );
}

function TenderArrivalScene() {
  return (
    <LessonScene
      testId="healthy-scene-apex-tender"
      eyebrow="A shipment begins"
      title="Apex has a load that needs to be shipped."
      narration="Its supplier system sends the load details to FreightBridge as JSON over a REST API."
      note={<><strong>Remember:</strong> this first message is not the X12 204 yet. It is Apex's JSON load information coming into FreightBridge.</>}
      consoleTitle="Message in transit · Apex → FreightBridge"
      consoleMeta="REST / JSON"
      lines={apexJson}
    >
      <NetworkPair
        left={<ServerNode name="Apex" caption="Supplier system" icon={<Server size={34} />} />}
        right={<ServerNode name="FreightBridge" caption="Integration platform" icon={<Server size={34} />} accent />}
        packet="JSON"
      />
    </LessonScene>
  );
}

function CanonicalScene() {
  return (
    <LessonScene
      testId="healthy-scene-canonical"
      eyebrow="Inside FreightBridge"
      title="FreightBridge turns partner-specific data into one internal shipment."
      narration="Authentication, parsing, and contract validation happen first. Then FreightBridge normalizes the load into its canonical shipment model."
      note={<><strong>Why it matters:</strong> later mappings do not need to understand Apex's exact JSON shape. They can work from one FreightBridge business model.</>}
      consoleTitle="FreightBridge processing"
      consoleMeta="Normalize"
      lines={canonicalJson}
    >
      <div className="healthy-transform-scene">
        <ServerNode name="Apex JSON" caption="Partner-specific" icon={<FileJson2 size={32} />} />
        <AnimatedConnector packet="validate" />
        <ServerNode name="Canonical Shipment" caption="FreightBridge internal model" icon={<Database size={34} />} accent />
      </div>
    </LessonScene>
  );
}

function Tender204Scene() {
  return (
    <LessonScene
      testId="healthy-scene-204"
      eyebrow="FreightBridge → Midwest"
      title="Now FreightBridge creates the X12 204 load tender."
      narration="The canonical shipment is mapped into Midwest's X12 004010 profile, then the 204 file is delivered through SFTP."
      note={<><strong>Look for:</strong> <code>ST*204</code> identifies the transaction, <code>B2</code> carries the load, <code>L11</code> carries references, and the stop/address segments describe pickup and delivery.</>}
      consoleTitle="MW204_LOAD500.edi"
      consoleMeta="X12 004010 · SFTP"
      lines={x12Tender}
    >
      <NetworkPair
        left={<ServerNode name="FreightBridge" caption="Creates the 204" icon={<Server size={34} />} accent />}
        right={<ServerNode name="Midwest" caption="Motor carrier" icon={<Truck size={34} />} />}
        packet="204"
      />
    </LessonScene>
  );
}

function AcknowledgmentScene() {
  return (
    <LessonScene
      testId="healthy-scene-997-990"
      eyebrow="Midwest responds"
      title="Two replies answer two different questions."
      narration="The 997 says the EDI transaction was technically acknowledged. The 990 tells FreightBridge whether Midwest accepted or rejected the load."
      note={<><strong>Critical:</strong> 997 ≠ carrier acceptance. The 990 is the business tender decision.</>}
      consoleTitle="Messages received · Midwest → FreightBridge"
      consoleMeta="997 then 990"
      lines={responses}
    >
      <div className="healthy-response-network">
        <ServerNode name="Midwest" caption="Motor carrier" icon={<Truck size={34} />} />
        <div className="healthy-dual-connector">
          <AnimatedConnector packet="997" reverse />
          <AnimatedConnector packet="990" reverse delay />
        </div>
        <ServerNode name="FreightBridge" caption="Records both meanings" icon={<Server size={34} />} accent />
      </div>
    </LessonScene>
  );
}

function ShipmentStatusScene({ complete }: { complete: boolean }) {
  return (
    <LessonScene
      testId="healthy-scene-214"
      eyebrow="The shipment moves"
      title="214 messages keep FreightBridge—and then Apex—updated."
      narration="Midwest reports shipment events. FreightBridge maps each carrier status code into its canonical status and passes the business update toward Apex."
      note={complete
        ? <><strong>Baseline learned:</strong> you now know what healthy communication looks like. The next module introduces failures and the real Console / Code / Answer workstation.</>
        : <><strong>Status map:</strong> AF → PICKED_UP, X6 → IN_TRANSIT, X1 → ARRIVED, D1 → DELIVERED.</>}
      consoleTitle="Shipment status stream"
      consoleMeta="X12 214"
      lines={statuses}
    >
      <div className="healthy-three-node-network">
        <ServerNode name="Midwest" caption="Sends 214s" icon={<Truck size={32} />} />
        <AnimatedConnector packet="214" reverse />
        <ServerNode name="FreightBridge" caption="Maps status" icon={<Server size={34} />} accent />
        <AnimatedConnector packet="update" />
        <ServerNode name="Apex" caption="Receives shipment status" icon={<Server size={32} />} />
      </div>
    </LessonScene>
  );
}

function LessonScene({
  testId,
  eyebrow,
  title,
  narration,
  note,
  consoleTitle,
  consoleMeta,
  lines,
  children,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  narration: string;
  note: ReactNode;
  consoleTitle: string;
  consoleMeta: string;
  lines: ConsoleLine[];
  children: ReactNode;
}) {
  return (
    <article className="healthy-story-scene" data-testid={testId}>
      <div className="healthy-story-copy">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>

      <div className="healthy-story-network">
        {children}
      </div>

      <div className="healthy-guide-bubble">
        <Sparkles size={18} />
        <p>{narration}</p>
      </div>

      <MessageConsole title={consoleTitle} meta={consoleMeta} lines={lines} />

      <div className="healthy-memory-note">{note}</div>
    </article>
  );
}

function NetworkPair({ left, right, packet }: { left: ReactNode; right: ReactNode; packet: string }) {
  return (
    <div className="healthy-network-pair">
      {left}
      <AnimatedConnector packet={packet} />
      {right}
    </div>
  );
}

function ServerNode({
  name,
  caption,
  icon,
  accent = false,
}: {
  name: string;
  caption: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={'healthy-server-node ' + (accent ? 'accent' : '')}>
      <div className="healthy-server-icon">{icon}</div>
      <strong>{name}</strong>
      <span>{caption}</span>
    </div>
  );
}

function AnimatedConnector({
  packet,
  reverse = false,
  delay = false,
}: {
  packet: string;
  reverse?: boolean;
  delay?: boolean;
}) {
  return (
    <div className={'healthy-connector ' + (reverse ? 'reverse ' : '') + (delay ? 'delay' : '')} aria-hidden="true">
      <span className="healthy-connector-line" />
      <span className="healthy-moving-packet"><FileText size={13} />{packet}</span>
    </div>
  );
}

function MessageConsole({ title, meta, lines }: { title: string; meta: string; lines: ConsoleLine[] }) {
  return (
    <section className="healthy-message-console" aria-label={title}>
      <header>
        <div className="healthy-console-lights" aria-hidden="true"><span /><span /><span /></div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </header>
      <div className="healthy-console-body">
        {lines.map((line, index) => (
          <code
            key={index}
            className={(line.emphasis ? 'emphasis ' : '') + (line.quiet ? 'quiet' : '')}
            style={{ '--line-delay': String(index) } as React.CSSProperties}
          >
            {line.text || ' '}
          </code>
        ))}
      </div>
    </section>
  );
}

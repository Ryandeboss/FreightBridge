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
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
  annotation?: string;
  emphasis?: boolean;
  quiet?: boolean;
};

const apexJson: ConsoleLine[] = [
  { text: 'POST /api/integrations/apex/load-tenders HTTP/1.1', annotation: 'Apex calls the FreightBridge-owned inbound load-tender endpoint.', emphasis: true },
  { text: 'Content-Type: application/json', annotation: 'The message body is JSON, not X12.', quiet: true },
  { text: 'Authorization: Bearer ••••••••', annotation: 'Partner authentication credential; the training example keeps the real secret redacted.', quiet: true },
  { text: '' },
  { text: '{' },
  { text: '  "loadId": "LOAD500",', annotation: 'Apex business identifier for this load. FreightBridge preserves it as the shipment number.', emphasis: true },
  { text: '  "bolNumber": "BOL900",', annotation: 'Bill of Lading reference used again in the Midwest EDI document.' },
  { text: '  "purchaseOrderNumber": "PO111",', annotation: 'Purchase-order reference used to correlate the same freight across systems.' },
  { text: '  "customerReference": "CUST-REF-500",', annotation: 'Optional customer routing/reference value carried by Apex.' },
  { text: '  "equipmentType": "VAN_53",', annotation: 'Apex says the shipment needs a 53-foot dry van.' },
  { text: '  "weightLbs": 42000,', annotation: 'Total shipment weight in pounds.' },
  { text: '  "pieces": 22,', annotation: 'Number of handling units/pieces.' },
  { text: '  "commodityDescription": "Packaged auto parts",', annotation: 'Plain-language description of the freight.' },
  { text: '  "pickup": {', annotation: 'Origin stop begins here.' },
  { text: '    "facilityName": "ABC Factory",' },
  { text: '    "address1": "200 Industrial Rd",' },
  { text: '    "address2": "Dock 4",' },
  { text: '    "city": "Aurora",' },
  { text: '    "state": "IL",' },
  { text: '    "postalCode": "60505",' },
  { text: '    "scheduledDateTime": "2026-10-01T14:00:00Z"', annotation: 'Requested pickup appointment time.' },
  { text: '  },' },
  { text: '  "delivery": {', annotation: 'Destination stop begins here.' },
  { text: '    "facilityName": "XYZ Warehouse",' },
  { text: '    "address1": "900 Commerce St",' },
  { text: '    "address2": null,' },
  { text: '    "city": "Detroit",' },
  { text: '    "state": "MI",' },
  { text: '    "postalCode": "48201",' },
  { text: '    "scheduledDateTime": "2026-10-02T18:00:00Z"', annotation: 'Requested delivery appointment time.' },
  { text: '  },' },
  { text: '  "references": [' },
  { text: '    {"type": "CUSTOMER_REF", "value": "CUST-REF-500", "description": "Customer routing reference"}', annotation: 'Typed references let FreightBridge preserve additional partner identifiers.' },
  { text: '  ],' },
  { text: '  "createdAt": "2026-09-19T14:00:00Z",' },
  { text: '  "updatedAt": "2026-09-19T14:05:00Z"' },
  { text: '}' },
];

const canonicalJson: ConsoleLine[] = [
  { text: 'CANONICAL SHIPMENT', annotation: 'FreightBridge has finished authentication, parsing, contract validation, and normalization.', emphasis: true },
  { text: '{' },
  { text: '  "shipment_number": "LOAD500",', annotation: 'Neutral internal shipment identifier derived from Apex loadId.', emphasis: true },
  { text: '  "equipment_type": "VAN_53",', annotation: 'Canonical equipment value used inside FreightBridge.' },
  { text: '  "weight_lbs": 42000,', annotation: 'Canonical shipment weight.' },
  { text: '  "pieces": 22,', annotation: 'Canonical handling-unit count.' },
  { text: '  "commodity_description": "Packaged auto parts",' },
  { text: '  "origin": {', annotation: 'Canonical pickup location.' },
  { text: '    "facility_name": "ABC Factory",' },
  { text: '    "address_line_1": "200 Industrial Rd",' },
  { text: '    "address_line_2": "Dock 4",' },
  { text: '    "city": "Aurora",' },
  { text: '    "state": "IL",' },
  { text: '    "postal_code": "60505",' },
  { text: '    "scheduled_at": "2026-10-01T14:00:00Z"' },
  { text: '  },' },
  { text: '  "destination": {', annotation: 'Canonical delivery location.' },
  { text: '    "facility_name": "XYZ Warehouse",' },
  { text: '    "address_line_1": "900 Commerce St",' },
  { text: '    "address_line_2": null,' },
  { text: '    "city": "Detroit",' },
  { text: '    "state": "MI",' },
  { text: '    "postal_code": "48201",' },
  { text: '    "scheduled_at": "2026-10-02T18:00:00Z"' },
  { text: '  },' },
  { text: '  "references": [', annotation: 'Business references are normalized into typed rows.' },
  { text: '    {"reference_type": "BOL", "reference_value": "BOL900"},' },
  { text: '    {"reference_type": "PO", "reference_value": "PO111"}' },
  { text: '  ],' },
  { text: '  "tender_status": "PENDING",', annotation: 'Midwest has not made its business accept/reject decision yet.' },
  { text: '  "current_status": "PLANNED",', annotation: 'The shipment has not physically moved yet.' },
  { text: '  "current_status_occurred_at": null' },
  { text: '}' },
];

const x12Tender: ConsoleLine[] = [
  { text: 'ISA*00*          *00*          *ZZ*FREIGHTBRIDGE  *ZZ*MWCX           *261001*1400*U*00401*000000901*0*T*:~', annotation: 'Interchange envelope: sender, receiver, date/time, X12 control version, and interchange control number.', quiet: true },
  { text: 'GS*SM*FREIGHTBRIDGE*MWCX*20261001*1400*901*X*004010~', annotation: 'Functional group. SM identifies the motor-carrier load-tender group; 004010 is the Midwest profile.', quiet: true },
  { text: 'ST*204*0001~', annotation: 'Starts transaction set 204. 204 means Motor Carrier Load Tender.', emphasis: true },
  { text: 'B2**MWCX**LOAD500**PP~', annotation: 'Midwest carrier code MWCX, shipment LOAD500, and PP payment-method convention.', emphasis: true },
  { text: 'L11*BOL900*BM~', annotation: 'Bill of Lading BOL900. BM is the Midwest profile qualifier for BOL.' },
  { text: 'L11*PO111*PO~', annotation: 'Purchase Order PO111.' },
  { text: 'G62*37*20261001*I*1400~', annotation: 'Pickup appointment: October 1, 2026 at 14:00 UTC in this fixture.' },
  { text: 'G62*38*20261002*K*1800~', annotation: 'Delivery appointment: October 2, 2026 at 18:00 UTC.' },
  { text: 'S5*1*LD~', annotation: 'Stop 1 is the pickup/load stop.' },
  { text: 'N1*SH*ABC Factory~', annotation: 'SH identifies the shipper/origin party.' },
  { text: 'N3*200 Industrial Rd~', annotation: 'Origin street address.' },
  { text: 'N4*Aurora*IL*60505~', annotation: 'Origin city, state, and postal code.' },
  { text: 'S5*2*UL~', annotation: 'Stop 2 is the delivery/unload stop.' },
  { text: 'N1*CN*XYZ Warehouse~', annotation: 'CN identifies the consignee/destination party.' },
  { text: 'N3*900 Commerce St~', annotation: 'Destination street address.' },
  { text: 'N4*Detroit*MI*48201~', annotation: 'Destination city, state, and postal code.' },
  { text: 'L3*42000*G***22~', annotation: 'Gross weight 42,000 lb and 22 handling units in the current Midwest profile.' },
  { text: 'SE*16*0001~', annotation: 'Ends the 204 transaction set; control number 0001 matches ST02.' },
  { text: 'GE*1*901~', annotation: 'Ends the functional group; control 901 matches GS06.', quiet: true },
  { text: 'IEA*1*000000901~', annotation: 'Ends the interchange; control 000000901 matches ISA13.', quiet: true },
];

const responses: ConsoleLine[] = [
  { text: '997 FUNCTIONAL ACKNOWLEDGMENT', annotation: 'First response: technical EDI acknowledgment only.', emphasis: true },
  { text: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *261001*1410*U*00401*000000902*0*T*:~', annotation: 'Midwest is now the sender; FreightBridge is the receiver.', quiet: true },
  { text: 'GS*FA*MWCX*FREIGHTBRIDGE*20261001*1410*902*X*004010~', annotation: 'FA identifies a functional-acknowledgment group.', quiet: true },
  { text: 'ST*997*0002~', annotation: 'Starts the 997 transaction.' },
  { text: 'AK1*SM*901~', annotation: 'Acknowledges the original SM functional group with group control 901.' },
  { text: 'AK2*204*0001~', annotation: 'Acknowledges the original 204 transaction and its ST control 0001.' },
  { text: 'AK5*A~', annotation: 'A means the individual 204 was technically accepted.', emphasis: true },
  { text: 'AK9*A*1*1*1~', annotation: 'Group accepted: 1 included, 1 received, 1 accepted.', emphasis: true },
  { text: 'SE*6*0002~', annotation: 'Ends the 997 transaction.' },
  { text: 'GE*1*902~', annotation: 'Ends the 997 functional group.', quiet: true },
  { text: 'IEA*1*000000902~', annotation: 'Ends the 997 interchange.', quiet: true },
  { text: '' },
  { text: '990 TENDER RESPONSE', annotation: 'Second response: the carrier business decision.', emphasis: true },
  { text: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *261001*1445*U*00401*000000903*0*T*:~', annotation: 'New Midwest-to-FreightBridge interchange for the tender decision.', quiet: true },
  { text: 'GS*GF*MWCX*FREIGHTBRIDGE*20261001*1445*903*X*004010~', annotation: 'GF is the functional group used by this project for the 990.', quiet: true },
  { text: 'ST*990*0003~', annotation: 'Starts the 990 Response to Load Tender.' },
  { text: 'B1*MWCX*LOAD500*20261001*A~', annotation: 'A is the actual carrier accept decision for LOAD500.', emphasis: true },
  { text: 'L11*BOL900*BM~', annotation: 'BOL reference ties the response back to the same freight.' },
  { text: 'L11*PO111*PO~', annotation: 'PO reference provides another correlation key.' },
  { text: 'L11*MWC900500*CN~', annotation: 'Midwest carrier load number assigned after acceptance.' },
  { text: 'SE*6*0003~', annotation: 'Ends the 990 transaction.' },
  { text: 'GE*1*903~', annotation: 'Ends the 990 functional group.', quiet: true },
  { text: 'IEA*1*000000903~', annotation: 'Ends the 990 interchange.', quiet: true },
];

const status214: ConsoleLine[] = [
  { text: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *261001*2015*U*00401*000000904*0*T*:~', annotation: 'Midwest sends a shipment-status interchange to FreightBridge.', quiet: true },
  { text: 'GS*QM*MWCX*FREIGHTBRIDGE*20261001*2015*904*X*004010~', annotation: 'QM is the shipment-status functional group used for the 214.', quiet: true },
  { text: 'ST*214*0004~', annotation: 'Starts an X12 214 Transportation Carrier Shipment Status Message.', emphasis: true },
  { text: 'B10*MWC900500*LOAD500*MWCX~', annotation: 'Carrier load number, FreightBridge/Apex shipment number, and Midwest carrier code.', emphasis: true },
  { text: 'L11*BOL900*BM~', annotation: 'Repeats the BOL reference for correlation.' },
  { text: 'L11*PO111*PO~', annotation: 'Repeats the purchase-order reference.' },
  { text: 'AT7*X6****20261001*2015*UT~', annotation: 'X6 is Midwest’s status code for en route; date/time says when the event occurred.', emphasis: true },
  { text: 'MS1*Toledo*OH~', annotation: 'Event location reported by the carrier.' },
  { text: 'SE*8*0004~', annotation: 'Ends the 214 transaction.' },
  { text: 'GE*1*904~', annotation: 'Ends the shipment-status functional group.', quiet: true },
  { text: 'IEA*1*000000904~', annotation: 'Ends the 214 interchange.', quiet: true },
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
        <span>{complete ? 'Healthy flow lesson complete' : 'Read the whole message, then continue.'}</span>
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
      narration="Its supplier system sends the complete load record to FreightBridge as JSON over HTTPS."
      explanationTitle="What this request means"
      explanation={
        <>
          <p>Apex is telling FreightBridge what needs to move, where it must be picked up and delivered, and which business references identify the freight. FreightBridge owns the inbound endpoint; Apex is simply the caller.</p>
          <p>The JSON is still Apex-shaped data. It has not become X12 yet. FreightBridge must authenticate the caller, parse the JSON, validate the contract, and normalize the business data before it can create a Midwest 204.</p>
        </>
      }
      consoleTitle="Complete teaching request · Apex → FreightBridge"
      consoleMeta="HTTPS / JSON"
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
      title="FreightBridge turns Apex data into one internal shipment."
      narration="After authentication, parsing, and contract validation, FreightBridge normalizes the partner payload into its canonical shipment model."
      explanationTitle="Why FreightBridge creates a canonical model"
      explanation={
        <>
          <p>The canonical shipment is FreightBridge’s neutral business representation. It prevents every partner integration from needing to understand every other partner’s private field names and shapes.</p>
          <p>Notice that the meaning stays the same—LOAD500, the two stops, BOL900, PO111, weight, pieces—but the names now follow FreightBridge’s internal model. Tender status is still PENDING and shipment status is still PLANNED because Midwest has not responded and the freight has not moved.</p>
        </>
      }
      consoleTitle="Complete teaching object · FreightBridge canonical shipment"
      consoleMeta="Internal model"
      lines={canonicalJson}
    >
      <div className="healthy-transform-scene">
        <ServerNode name="Apex JSON" caption="Partner-specific" icon={<FileJson2 size={32} />} />
        <AnimatedConnector packet="normalize" />
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
      title="FreightBridge creates the X12 204 load tender."
      narration="The canonical shipment is mapped into Midwest’s X12 004010 profile. SFTP transports the resulting EDI file to Midwest."
      explanationTitle="How to read this 204"
      explanation={
        <>
          <p>Start with the envelope: ISA/IEA wrap the interchange, GS/GE wrap the functional group, and ST/SE wrap this specific 204 transaction. Inside that envelope, B2 identifies the shipment, L11 carries references, G62 carries appointments, S5 separates the stops, N1/N3/N4 describe the parties and addresses, and L3 carries the shipment weight and handling units.</p>
          <p>This file being delivered successfully would prove that FreightBridge generated and transported the tender. It still would not prove that Midwest accepted the load; that business decision arrives later in the 990.</p>
        </>
      }
      consoleTitle="Complete teaching document · MW204_LOAD500.edi"
      consoleMeta="X12 004010 / SFTP"
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
      title="The 997 and 990 answer different questions."
      narration="Midwest first acknowledges the EDI transaction technically, then sends the separate business decision about the tender."
      explanationTitle="Do not confuse technical success with business acceptance"
      explanation={
        <>
          <p>The 997 points back to the original 204 group and transaction controls. AK5=A and AK9=A mean the 204 was technically accepted by the EDI process. That tells FreightBridge the document was received and structurally acknowledged.</p>
          <p>The 990 is the business answer. In its B1 segment, the final A means Midwest accepted LOAD500. If you are investigating whether the carrier actually took the load, the 990—not the 997—is the evidence you need.</p>
        </>
      }
      consoleTitle="Complete teaching documents · Midwest → FreightBridge"
      consoleMeta="997 followed by 990"
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
      title="A 214 reports where the shipment is in its lifecycle."
      narration="This complete example is an X6 in-transit event. FreightBridge correlates it to LOAD500 and translates Midwest’s partner code into its canonical status."
      explanationTitle="How FreightBridge turns a 214 into a useful shipment update"
      explanation={
        <>
          <p>B10 ties the carrier event back to Midwest load MWC900500 and FreightBridge/Apex shipment LOAD500. L11 repeats business references, AT7 carries the status plus event time, and MS1 tells FreightBridge where the event occurred.</p>
          <p>In the active Midwest profile, AF maps to PICKED_UP, X6 maps to IN_TRANSIT, X1 maps to ARRIVED, and D1 maps to DELIVERED. The example above uses X6, so FreightBridge records an IN_TRANSIT event and can send the normalized status back toward Apex.</p>
          {complete && <p><strong>Baseline learned:</strong> the next module introduces failures and the real Console / Code / Answer troubleshooting workstation.</p>}
        </>
      }
      consoleTitle="Complete teaching document · Midwest 214"
      consoleMeta="X12 004010 / X6"
      lines={status214}
    >
      <div className="healthy-three-node-network">
        <ServerNode name="Midwest" caption="Sends the 214" icon={<Truck size={32} />} />
        <AnimatedConnector packet="214" reverse />
        <ServerNode name="FreightBridge" caption="Maps X6 → IN_TRANSIT" icon={<Server size={34} />} accent />
        <AnimatedConnector packet="update" />
        <ServerNode name="Apex" caption="Receives normalized status" icon={<Server size={32} />} />
      </div>
    </LessonScene>
  );
}

function LessonScene({
  testId,
  eyebrow,
  title,
  narration,
  explanationTitle,
  explanation,
  consoleTitle,
  consoleMeta,
  lines,
  children,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  narration: string;
  explanationTitle: string;
  explanation: ReactNode;
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

      <section className="healthy-document-explanation" data-testid={testId + '-explanation'}>
        <h2>{explanationTitle}</h2>
        <div>{explanation}</div>
      </section>
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
    <section className="healthy-message-console" aria-label={title} data-testid="healthy-full-message">
      <header>
        <div className="healthy-console-lights" aria-hidden="true"><span /><span /><span /></div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </header>
      <div className="healthy-console-body">
        {lines.map((line, index) => (
          <div
            className={'healthy-console-line ' + (line.emphasis ? 'emphasis ' : '') + (line.quiet ? 'quiet' : '')}
            key={index}
            style={{ '--line-delay': String(index) } as CSSProperties}
          >
            <code>{line.text || ' '}</code>
            {line.annotation && <span className="healthy-line-annotation">// {line.annotation}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

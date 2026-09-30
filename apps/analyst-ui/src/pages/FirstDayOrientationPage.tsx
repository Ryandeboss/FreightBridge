import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Code2,
  FileText,
  Map,
  MessageSquareText,
  Network,
  PackageCheck,
  Route,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TRAINING_ROLE } from '../training/missions';
import { markFirstDayOrientationComplete } from '../training/orientation';

const STEP_COUNT = 6;

export function FirstDayOrientationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  function finishOrientation() {
    markFirstDayOrientationComplete();
    navigate('/learn/healthy/apex-tender');
  }

  return (
    <main className="story-orientation-page" data-testid="first-day-orientation-page">
      <header className="story-orientation-topbar">
        <Link className="story-orientation-exit" to="/learn/desk">
          <ArrowLeft size={16} />
          Exit orientation
        </Link>
        <div className="story-orientation-brand">
          <span><ShieldCheck size={17} /></span>
          <strong>FreightBridge</strong>
          <small>First-Day Orientation</small>
        </div>
        <span className="story-orientation-counter">{step + 1} / {STEP_COUNT}</span>
      </header>

      <div className="story-orientation-progress" aria-label={`Orientation scene ${step + 1} of ${STEP_COUNT}`}>
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <span
            key={index}
            className={index < step ? 'complete' : index === step ? 'current' : ''}
            aria-hidden="true"
          />
        ))}
      </div>

      <section className="story-orientation-stage">
        {step === 0 && <CompaniesScene />}
        {step === 1 && <TenderBeginsScene />}
        {step === 2 && <TenderDecisionScene />}
        {step === 3 && <ShipmentMovesScene />}
        {step === 4 && <TranslationScene />}
        {step === 5 && <YourJobScene />}
      </section>

      <footer className="story-orientation-actions">
        <button
          className="story-button story-button-secondary"
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          <ArrowLeft size={17} />
          Back
        </button>

        {step < STEP_COUNT - 1 ? (
          <button
            className="story-button story-button-primary"
            type="button"
            onClick={() => setStep((current) => Math.min(STEP_COUNT - 1, current + 1))}
          >
            Continue
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="story-button story-button-primary" type="button" onClick={finishOrientation}>
            Start the healthy shipment
            <ArrowRight size={17} />
          </button>
        )}
      </footer>
    </main>
  );
}

function SceneIntro({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="story-scene-intro">
      <p>{kicker}</p>
      <h1>{title}</h1>
      <span>{body}</span>
    </div>
  );
}

function CompaniesScene() {
  return (
    <article className="story-scene" data-testid="orientation-companies">
      <SceneIntro
        kicker="Meet the network"
        title="Three companies make one shipment journey possible."
        body="Apex has freight to move. Midwest moves it. FreightBridge connects their systems."
      />

      <div className="story-company-flow" aria-label="Apex Logistics to FreightBridge to Midwest Carrier">
        <CompanyCard icon={<Building2 size={30} />} name="Apex Logistics" role="Broker / 3PL" detail="Creates freight requests." />
        <FlowArrow label="request" />
        <CompanyCard icon={<Network size={30} />} name="FreightBridge" role="Integration Hub" detail="Translates and routes messages." emphasis />
        <FlowArrow label="connects" />
        <CompanyCard icon={<Truck size={30} />} name="Midwest Carrier" role="Motor Carrier" detail="Accepts freight and moves it." />
      </div>
    </article>
  );
}

function TenderBeginsScene() {
  return (
    <article className="story-scene" data-testid="orientation-tender-begins">
      <SceneIntro
        kicker="A shipment begins"
        title="Apex asks for a carrier."
        body="Apex creates a load tender and sends the shipment details to FreightBridge."
      />

      <div className="story-tender-scene">
        <div className="story-load-card">
          <span className="story-icon"><PackageCheck size={28} /></span>
          <small>New load</small>
          <strong>Aurora, IL → Detroit, MI</strong>
          <span>42,000 lb</span>
        </div>
        <div className="story-motion-line">
          <span />
          <ArrowRight size={24} />
          <small>freight request</small>
        </div>
        <div className="story-destination-card">
          <span className="story-icon"><ShieldCheck size={28} /></span>
          <strong>FreightBridge receives it</strong>
          <span>The shipment conversation has started.</span>
        </div>
      </div>
    </article>
  );
}

function TenderDecisionScene() {
  return (
    <article className="story-scene" data-testid="orientation-tender-decision">
      <SceneIntro
        kicker="Tendering the load"
        title="FreightBridge sends the carrier a 204."
        body="The carrier first acknowledges the EDI document, then separately makes the business decision."
      />

      <div className="story-message-sequence">
        <MessageRow direction="right" code="204" title="Load Tender" detail="FreightBridge → Midwest · Will you haul this load?" />
        <MessageRow direction="left" code="997" title="Technical acknowledgment" detail="Midwest → FreightBridge · I received and processed the EDI document." muted />
        <MessageRow direction="left" code="990" title="Tender Response" detail="Midwest → FreightBridge · Accept or reject the load." />
      </div>

      <div className="story-truth-callout">
        <CheckCircle2 size={20} />
        <p><strong>997 does not mean the carrier accepted the load.</strong> The 990 is the business tender decision.</p>
      </div>
    </article>
  );
}

function ShipmentMovesScene() {
  const statuses = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];
  return (
    <article className="story-scene" data-testid="orientation-shipment-moves">
      <SceneIntro
        kicker="The freight is moving"
        title="Now the carrier keeps everyone updated."
        body="Midwest sends 214 shipment-status messages as the load progresses."
      />

      <div className="story-shipment-route">
        <div className="story-route-line" aria-hidden="true" />
        {statuses.map((status, index) => (
          <div className="story-route-stop" key={status}>
            <span>{index === statuses.length - 1 ? <PackageCheck size={20} /> : <Truck size={20} />}</span>
            <strong>{status}</strong>
          </div>
        ))}
      </div>

      <p className="story-center-note">FreightBridge translates each update and keeps the shipment state moving forward.</p>
    </article>
  );
}

function TranslationScene() {
  return (
    <article className="story-scene" data-testid="orientation-translation">
      <SceneIntro
        kicker="Why FreightBridge exists"
        title="The partners do not speak the same technical language."
        body="Apex uses modern REST/JSON. Midwest uses X12 EDI. FreightBridge preserves the business meaning while translating between them."
      />

      <div className="story-translation-grid">
        <section>
          <div className="story-format-label"><Code2 size={18} /><span>Apex · JSON</span></div>
          <pre>{`{
  "destination": "Detroit",
  "weight": 42000
}`}</pre>
        </section>

        <div className="story-translation-core">
          <span><Network size={28} /></span>
          <strong>FreightBridge</strong>
          <small>normalize → map → translate</small>
        </div>

        <section>
          <div className="story-format-label"><FileText size={18} /><span>Midwest · X12</span></div>
          <pre>{`N1*CN*XYZ WAREHOUSE~
N4*DETROIT*MI*48201~`}</pre>
        </section>
      </div>

      <p className="story-center-note">You do not need to decode the syntax yet. The next lesson will teach the technical artifacts.</p>
    </article>
  );
}

function YourJobScene() {
  return (
    <article className="story-scene" data-testid="orientation-your-job">
      <SceneIntro
        kicker="Your role"
        title={TRAINING_ROLE}
        body="Your job is to understand the conversation between systems and help restore it when something breaks."
      />

      <div className="story-job-concepts">
        <ConceptCard icon={<Route size={24} />} title="Network" body="Did the message reach the next system?" />
        <ConceptCard icon={<MessageSquareText size={24} />} title="Messages" body="What did the systems actually send and receive?" />
        <ConceptCard icon={<Map size={24} />} title="Mapping" body="Was the business meaning translated correctly?" />
      </div>

      <div className="story-job-loop" aria-label="Integration support workflow">
        <span>Find where the conversation stopped</span>
        <ArrowRight size={17} />
        <span>Correct the relevant rule or configuration</span>
        <ArrowRight size={17} />
        <span>Run it again and verify recovery</span>
        <ArrowRight size={17} />
        <span>Explain the result clearly</span>
      </div>

      <div className="story-ready-message">
        <ShieldCheck size={22} />
        <div>
          <strong>That is enough for day one.</strong>
          <span>Next, you will watch one healthy shipment complete the journey before you troubleshoot anything.</span>
        </div>
      </div>
    </article>
  );
}

function CompanyCard({
  icon,
  name,
  role,
  detail,
  emphasis = false,
}: {
  icon: React.ReactNode;
  name: string;
  role: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <section className={`story-company-card ${emphasis ? 'emphasis' : ''}`}>
      <span className="story-icon">{icon}</span>
      <small>{role}</small>
      <strong>{name}</strong>
      <p>{detail}</p>
    </section>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="story-flow-arrow" aria-hidden="true">
      <ArrowRight size={22} />
      <small>{label}</small>
    </div>
  );
}

function MessageRow({
  direction,
  code,
  title,
  detail,
  muted = false,
}: {
  direction: 'left' | 'right';
  code: string;
  title: string;
  detail: string;
  muted?: boolean;
}) {
  return (
    <div className={`story-message-row ${direction} ${muted ? 'muted' : ''}`}>
      <span className="story-message-code">{code}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <ArrowRight className="story-message-arrow" size={20} aria-hidden="true" />
    </div>
  );
}

function ConceptCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <section className="story-concept-card">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </section>
  );
}

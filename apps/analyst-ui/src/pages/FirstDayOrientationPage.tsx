import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Code,
  FileText,
  Network,
  Server,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TRAINING_ROLE } from '../training/missions';
import { markFirstDayOrientationComplete } from '../training/orientation';

const STEP_COUNT = 5;
type CompanyKey = 'apex' | 'freightbridge' | 'midwest';

const companyDetails: Record<CompanyKey, {
  name: string;
  role: string;
  businessMeaning: string;
  technology: string;
  analystBoundary: string;
}> = {
  apex: {
    name: 'Apex Logistics',
    role: 'Broker / 3PL · External Trading Partner',
    businessMeaning: 'Apex has freight that needs to be moved. It asks FreightBridge to get that shipment into the carrier workflow.',
    technology: 'REST API + JSON',
    analystBoundary: 'You can verify what Apex sent to FreightBridge and what FreightBridge returned. You cannot see Apex private application logs or databases.',
  },
  freightbridge: {
    name: 'FreightBridge',
    role: 'Your Workplace · Integration Platform',
    businessMeaning: 'FreightBridge translates between partner systems, preserves business identifiers, records evidence, and keeps the shipment conversation moving.',
    technology: 'REST/JSON ↔ canonical shipment ↔ X12/SFTP',
    analystBoundary: 'This is the system you support. Its transactions, mappings, errors, processing logs, and safe transport evidence are your primary source of truth.',
  },
  midwest: {
    name: 'Midwest Carrier',
    role: 'Motor Carrier · External Trading Partner',
    businessMeaning: 'Midwest decides whether to accept the tender and then physically moves the freight while sending shipment updates.',
    technology: 'X12 004010 + SFTP',
    analystBoundary: 'You can verify the X12 and SFTP evidence FreightBridge exchanged with Midwest. You cannot see Midwest private EDI translator logs or internal dispatch systems.',
  },
};

export function FirstDayOrientationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedCompany, setSelectedCompany] = useState<CompanyKey>('freightbridge');

  function nextStep() {
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1));
  }

  function previousStep() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function finishOrientation() {
    markFirstDayOrientationComplete();
    navigate('/learn/healthy/apex-tender');
  }

  return (
    <section className="orientation-page" data-testid="first-day-orientation-page">
      <header className="orientation-header">
        <div>
          <p className="eyebrow">Mike · New Employee Briefing</p>
          <h1>First-Day Orientation</h1>
          <p>
            Learn the business flow first. Technical details will make more sense once you know
            who is talking, why the message exists, and what FreightBridge is responsible for.
          </p>
        </div>
        <div className="orientation-role-card">
          <span>Your role</span>
          <strong>{TRAINING_ROLE}</strong>
        </div>
      </header>

      <div className="orientation-progress" aria-label={`Orientation step ${step + 1} of ${STEP_COUNT}`}>
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <span
            key={index}
            className={index < step ? 'complete' : index === step ? 'current' : ''}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="orientation-workarea">
        {step === 0 && <WelcomeStep />}
        {step === 1 && <PartnersStep selectedCompany={selectedCompany} onSelectCompany={setSelectedCompany} />}
        {step === 2 && <ProtocolStep />}
        {step === 3 && <EvidenceBoundaryStep />}
        {step === 4 && <ReadyStep />}
      </div>

      <footer className="orientation-actions">
        <div>
          {step > 0 ? (
            <button className="secondary-button" type="button" onClick={previousStep}>
              <ArrowLeft size={16} />
              Previous
            </button>
          ) : (
            <Link className="secondary-button" to="/learn/desk">Back to Ops Desk</Link>
          )}
        </div>

        <span>Step {step + 1} of {STEP_COUNT}</span>

        {step < STEP_COUNT - 1 ? (
          <button className="primary-button" type="button" onClick={nextStep}>
            Next orientation step
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={finishOrientation}>
            <CheckCircle2 size={16} />
            Finish Orientation &amp; Start Healthy Walkthrough
          </button>
        )}
      </footer>
    </section>
  );
}

function WelcomeStep() {
  return (
    <article className="orientation-step orientation-welcome" data-testid="orientation-welcome">
      <div className="orientation-mike">
        <div className="ops-manager-avatar">M</div>
        <div>
          <p className="eyebrow">Mike · Integration Manager</p>
          <h2>Welcome to the integration team.</h2>
          <p>
            Apex has freight. Midwest can move it. The problem is that their systems do not speak
            the same language. FreightBridge sits in the middle so the business process can keep moving.
          </p>
        </div>
      </div>

      <div className="orientation-business-flow" aria-label="Basic FreightBridge business flow">
        <div>
          <BriefcaseBusiness size={22} />
          <strong>Apex Logistics</strong>
          <span>Has freight to move</span>
        </div>
        <ArrowRight size={22} aria-hidden="true" />
        <div className="freightbridge">
          <ShieldCheck size={22} />
          <strong>FreightBridge</strong>
          <span>Translates + tracks</span>
        </div>
        <ArrowRight size={22} aria-hidden="true" />
        <div>
          <Truck size={22} />
          <strong>Midwest Carrier</strong>
          <span>Hauls the freight</span>
        </div>
      </div>

      <div className="orientation-callout">
        <strong>Your job is not “fix EDI.”</strong>
        <p>
          Your job is to find where the business conversation stopped, prove it with FreightBridge
          evidence, take a safe action, and verify the flow recovered.
        </p>
      </div>
    </article>
  );
}

function PartnersStep({
  selectedCompany,
  onSelectCompany,
}: {
  selectedCompany: CompanyKey;
  onSelectCompany: (company: CompanyKey) => void;
}) {
  const detail = companyDetails[selectedCompany];

  return (
    <article className="orientation-step" data-testid="orientation-partners">
      <div className="orientation-step-heading">
        <p className="eyebrow">Who you work with</p>
        <h2>Three companies, three different viewpoints</h2>
        <p>Select each company to see what matters to an Integration Support Analyst.</p>
      </div>

      <div className="orientation-company-grid">
        <button className={selectedCompany === 'apex' ? 'selected' : ''} type="button" onClick={() => onSelectCompany('apex')} data-testid="orientation-company-apex">
          <BriefcaseBusiness size={22} /><strong>Apex Logistics</strong><span>Broker / 3PL</span>
        </button>
        <button className={selectedCompany === 'freightbridge' ? 'selected' : ''} type="button" onClick={() => onSelectCompany('freightbridge')} data-testid="orientation-company-freightbridge">
          <ShieldCheck size={22} /><strong>FreightBridge</strong><span>Your workplace</span>
        </button>
        <button className={selectedCompany === 'midwest' ? 'selected' : ''} type="button" onClick={() => onSelectCompany('midwest')} data-testid="orientation-company-midwest">
          <Truck size={22} /><strong>Midwest Carrier</strong><span>Motor carrier</span>
        </button>
      </div>

      <div className="orientation-company-detail" data-testid="orientation-company-detail">
        <div>
          <p className="eyebrow">{detail.role}</p>
          <h3>{detail.name}</h3>
          <p>{detail.businessMeaning}</p>
        </div>
        <dl>
          <div><dt>How FreightBridge communicates</dt><dd>{detail.technology}</dd></div>
          <div><dt>Support boundary</dt><dd>{detail.analystBoundary}</dd></div>
        </dl>
      </div>
    </article>
  );
}

function ProtocolStep() {
  return (
    <article className="orientation-step" data-testid="orientation-protocols">
      <div className="orientation-step-heading">
        <p className="eyebrow">How the systems talk</p>
        <h2>Format and transport are different things</h2>
        <p>Think of the message format as what is written in the package, and the transport as how the package travels.</p>
      </div>

      <div className="orientation-protocol-flow">
        <section>
          <div className="orientation-protocol-icon"><Code size={20} /></div>
          <p className="eyebrow">Apex → FreightBridge</p>
          <h3>REST API + JSON</h3>
          <p><strong>REST API</strong> is the web interface Apex calls. <strong>JSON</strong> is the structured data inside the request.</p>
          <small>Business meaning: “Here is a load I need moved.”</small>
        </section>

        <div className="orientation-transform"><ArrowRight size={20} /><span>normalize + map</span></div>

        <section className="freightbridge">
          <div className="orientation-protocol-icon"><Network size={20} /></div>
          <p className="eyebrow">Inside FreightBridge</p>
          <h3>Canonical Shipment</h3>
          <p>FreightBridge converts partner-specific fields into one internal shipment model before translating again.</p>
          <small>Business meaning: preserve the shipment while changing the technical language.</small>
        </section>

        <div className="orientation-transform"><ArrowRight size={20} /><span>translate + send</span></div>

        <section>
          <div className="orientation-protocol-icon"><FileText size={20} /></div>
          <p className="eyebrow">FreightBridge → Midwest</p>
          <h3>X12 204 + SFTP</h3>
          <p><strong>X12 204</strong> is the EDI load tender. <strong>SFTP</strong> is the secure file transport used to deliver it.</p>
          <small>Business meaning: “Will you haul this load?”</small>
        </section>
      </div>

      <div className="orientation-response-strip">
        <div><strong>997</strong><span>Technical / functional acknowledgment</span><small>“I received and structurally processed the EDI.”</small></div>
        <div><strong>990</strong><span>Business tender response</span><small>“I accept or reject the load.”</small></div>
        <div><strong>214</strong><span>Shipment status</span><small>“The freight is picked up, moving, arrived, or delivered.”</small></div>
      </div>

      <div className="orientation-callout compact">
        <Server size={18} />
        <p>
          A successful SFTP transfer does not prove the carrier accepted the load. Transport success,
          EDI acknowledgment, and business outcome are separate checkpoints.
        </p>
      </div>
    </article>
  );
}

function EvidenceBoundaryStep() {
  return (
    <article className="orientation-step" data-testid="orientation-evidence-boundary">
      <div className="orientation-step-heading">
        <p className="eyebrow">Your evidence boundary</p>
        <h2>Partner reports are claims. FreightBridge evidence is what you verify.</h2>
        <p>Support analysts do not magically see inside partner systems. You investigate the evidence available at the FreightBridge integration boundary.</p>
      </div>

      <div className="orientation-boundary-grid">
        <section className="can-see">
          <h3>FreightBridge can verify</h3>
          <ul>
            <li>Inbound API requests FreightBridge received</li>
            <li>Safe JSON fields and business identifiers</li>
            <li>Authentication, parsing, validation, and mapping results</li>
            <li>X12 generated or received by FreightBridge</li>
            <li>SFTP delivery and archive evidence FreightBridge observed</li>
            <li>997, 990, and 214 messages FreightBridge received</li>
            <li>Transactions, processing logs, mappings, and integration errors</li>
          </ul>
        </section>

        <section className="cannot-see">
          <h3>FreightBridge cannot see</h3>
          <ul>
            <li>Apex private databases or application logs</li>
            <li>Midwest private EDI translator internals</li>
            <li>Carrier dispatch screens unless Midwest reports what they show</li>
            <li>Secrets, passwords, private keys, or hidden partner credentials</li>
          </ul>
        </section>
      </div>

      <div className="orientation-evidence-example">
        <p className="eyebrow">Example</p>
        <strong>Midwest says, “We sent the status.”</strong>
        <p>
          Do not immediately conclude FreightBridge lost it. First ask: Did FreightBridge receive a
          file? Could it parse the X12? Did the status map? Was an Apex callback created? Where is the
          last healthy checkpoint?
        </p>
      </div>
    </article>
  );
}

function ReadyStep() {
  return (
    <article className="orientation-step" data-testid="orientation-ready">
      <div className="orientation-step-heading">
        <p className="eyebrow">Before your first load</p>
        <h2>Use the same troubleshooting habit every time</h2>
        <p>Mission 1 will show you a healthy shipment so you know what “normal” looks like.</p>
      </div>

      <ol className="orientation-analyst-loop">
        <li><strong>1</strong><span><b>Understand the complaint.</b> What does the partner say happened?</span></li>
        <li><strong>2</strong><span><b>Confirm receipt.</b> What did FreightBridge actually observe?</span></li>
        <li><strong>3</strong><span><b>Find the last healthy checkpoint.</b> Where did the evidence still look correct?</span></li>
        <li><strong>4</strong><span><b>Identify the expected next step.</b> What should have happened after that?</span></li>
        <li><strong>5</strong><span><b>Classify the layer.</b> Transport, format, mapping, validation, business rule, or partner response?</span></li>
        <li><strong>6</strong><span><b>Take a safe action.</b> Fix or replay without creating duplicate business effects.</span></li>
        <li><strong>7</strong><span><b>Verify recovery.</b> Prove the same business flow reached a healthy outcome.</span></li>
        <li><strong>8</strong><span><b>Report clearly.</b> State what failed, what changed, and what proves recovery.</span></li>
      </ol>

      <div className="orientation-callout">
        <CheckCircle2 size={20} />
        <div>
          <strong>You are ready for Mission 1.</strong>
          <p>You will follow one real simulated shipment from Apex through FreightBridge to Midwest, then watch acknowledgments and shipment status come back.</p>
        </div>
      </div>
    </article>
  );
}

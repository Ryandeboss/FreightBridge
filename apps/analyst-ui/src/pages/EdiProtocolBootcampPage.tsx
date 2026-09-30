import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Code2,
  FileText,
  Network,
  ShieldCheck,
  Truck,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { TrainingOutletContext } from '../components/training/TrainingShell';
import {
  completeEdiBootcamp,
  EDI_BOOTCAMP_LESSON_COUNT,
  loadEdiBootcampState,
  saveEdiBootcampLesson,
} from '../training/ediBootcamp';

type CheckOption = {
  id: string;
  label: string;
  explanation: string;
};

type KnowledgeCheckProps = {
  legend: string;
  options: CheckOption[];
  correctId: string;
  selected?: string;
  onSelect: (id: string) => void;
};

const requiredAnswers: Record<number, string> = {
  1: 'sftp-x12',
  4: 'st-se',
  5: '990',
  6: 'correlation',
};

export function EdiProtocolBootcampPage() {
  const navigate = useNavigate();
  const { setBootcampLesson } = useOutletContext<TrainingOutletContext>();
  const saved = useMemo(() => loadEdiBootcampState(), []);
  const [lesson, setLesson] = useState(saved.complete ? 1 : saved.lesson);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    setBootcampLesson(lesson);
    if (!saved.complete) saveEdiBootcampLesson(lesson);
  }, [lesson, saved.complete, setBootcampLesson]);

  const requiredAnswer = requiredAnswers[lesson];
  const canContinue = !requiredAnswer || answers[lesson] === requiredAnswer;

  function goBack() {
    setLesson((current) => Math.max(1, current - 1));
  }

  function goForward() {
    if (!canContinue) return;
    setLesson((current) => Math.min(EDI_BOOTCAMP_LESSON_COUNT, current + 1));
  }

  function finishBootcamp() {
    if (!canContinue) return;
    completeEdiBootcamp();
    setBootcampLesson(EDI_BOOTCAMP_LESSON_COUNT);
    navigate('/learn/healthy/workstation');
  }

  return (
    <section className="bootcamp-page" data-testid="edi-bootcamp-page">
      <div className="bootcamp-lesson-meta">
        <span>Module 02 · EDI &amp; Protocol Basics</span>
        <strong>Lesson {lesson} of {EDI_BOOTCAMP_LESSON_COUNT}</strong>
      </div>

      <div
        className="bootcamp-progress"
        aria-label={'EDI and protocol lesson ' + lesson + ' of ' + EDI_BOOTCAMP_LESSON_COUNT}
      >
        {Array.from({ length: EDI_BOOTCAMP_LESSON_COUNT }, (_, index) => (
          <span
            key={index}
            className={index + 1 < lesson ? 'complete' : index + 1 === lesson ? 'current' : ''}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="bootcamp-stage">
        {lesson === 1 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-layers">
            <LessonIntro
              kicker="Start with the layers"
              title="How a message travels is different from what the message looks like."
              body="Integration support gets much easier when you separate the connection or exchange method from the document format moving across it."
            />
            <div className="bootcamp-two-column">
              <ConceptCard icon={<Building2 size={24} />} title="Apex side" accent>
                <strong>REST API over HTTP</strong>
                <span>How Apex talks to FreightBridge.</span>
                <strong>JSON</strong>
                <span>The message format inside the API request.</span>
              </ConceptCard>
              <ConceptCard icon={<Truck size={24} />} title="Midwest side">
                <strong>SFTP</strong>
                <span>How FreightBridge and Midwest exchange files.</span>
                <strong>X12 EDI</strong>
                <span>The business-document syntax inside those files.</span>
              </ConceptCard>
            </div>
            <div className="bootcamp-rule">
              <Network size={20} />
              <span><strong>Keep the layers separate:</strong> a successful connection does not prove the message was valid, and a valid message does not prove the business outcome succeeded.</span>
            </div>
            <KnowledgeCheck
              legend="Which statement correctly separates the exchange method from the message format?"
              selected={answers[1]}
              correctId="sftp-x12"
              onSelect={(id) => setAnswers((current) => ({ ...current, 1: id }))}
              options={[
                { id: 'same', label: 'SFTP and X12 are two names for the same thing.', explanation: 'SFTP moves files. X12 defines the structure and meaning inside an EDI file.' },
                { id: 'sftp-x12', label: 'SFTP can move a file, while X12 defines the business message inside that file.', explanation: 'Correct. Transport/exchange and message format are different layers.' },
                { id: 'json-http', label: 'JSON is the network connection and HTTP is the document format.', explanation: 'Those are reversed. HTTP carries the request; JSON is the payload format.' },
              ]}
            />
          </article>
        )}

        {lesson === 2 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-rest-json">
            <LessonIntro
              kicker="Apex → FreightBridge"
              title="REST gives Apex an endpoint. JSON carries the load data."
              body="Apex sends a structured request to FreightBridge. The request has a method and route, headers, and a JSON body."
            />
            <div className="bootcamp-message-demo">
              <div className="bootcamp-message-header">
                <span className="bootcamp-method">POST</span>
                <code>/api/integrations/apex/load-tenders</code>
                <span className="bootcamp-status">202 Accepted</span>
              </div>
              <pre>{'{\n  "loadId": "LOAD500",\n  "bol": "BOL900",\n  "po": "PO111",\n  "shipper": "ABC Factory",\n  "consignee": "XYZ Warehouse"\n}'}</pre>
            </div>
            <div className="bootcamp-callouts">
              <MiniFact title="HTTP / REST" body="Defines how Apex addresses and invokes the FreightBridge API." />
              <MiniFact title="JSON" body="Carries the structured business fields FreightBridge must parse and validate." />
              <MiniFact title="202 Accepted" body="Means FreightBridge accepted the request for processing. It does not mean Midwest accepted the load." />
            </div>
          </article>
        )}

        {lesson === 3 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-sftp-x12">
            <LessonIntro
              kicker="FreightBridge ↔ Midwest"
              title="SFTP moves files. X12 gives those files business meaning."
              body="Midwest does not use the Apex REST/JSON contract. FreightBridge translates the canonical shipment and exchanges X12 files through the agreed SFTP folders."
            />
            <div className="bootcamp-sftp-flow" aria-label="Midwest SFTP directory flow">
              <FlowNode label="/inbound" detail="Files FreightBridge sends to Midwest" />
              <ArrowRight size={20} aria-hidden="true" />
              <FlowNode label="Midwest" detail="Carrier EDI processing" emphasis />
              <ArrowRight size={20} aria-hidden="true" />
              <FlowNode label="/outbound" detail="997, 990, and 214 files returned" />
            </div>
            <div className="bootcamp-code-pair">
              <div>
                <span>X12 file preview</span>
                <pre>{'ST*204*0001~\nB2**MWCX**LOAD500**PP~\nL11*BOL900*BM~\nL11*PO111*PO~\nSE*...*0001~'}</pre>
              </div>
              <div>
                <span>What FreightBridge can prove</span>
                <ul>
                  <li>Whether its SFTP connection succeeded.</li>
                  <li>Whether a file was written or received.</li>
                  <li>What message FreightBridge sent or received.</li>
                  <li>Its own parsing, mapping, validation, and business-processing results.</li>
                </ul>
              </div>
            </div>
            <div className="bootcamp-rule">
              <ShieldCheck size={20} />
              <span>FreightBridge does <strong>not</strong> pretend to see Midwest's private internal servers. It reasons from the evidence at its own integration boundary.</span>
            </div>
          </article>
        )}

        {lesson === 4 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-x12-envelope">
            <LessonIntro
              kicker="Read the envelope first"
              title="X12 wraps business transactions in layers."
              body="You do not need to memorize every segment. Start by recognizing the envelope, transaction set, version, and control numbers."
            />
            <div className="bootcamp-envelope">
              <EnvelopeRow segment="ISA" label="Interchange envelope" detail="Sender/receiver, date/time, version 00401, interchange control number" />
              <EnvelopeRow segment="GS" label="Functional group" detail="Groups related transaction sets; GS08 identifies 004010" />
              <EnvelopeRow segment="ST" label="Transaction set begins" detail="ST01 says what document this is; ST02 is its control number" accent />
              <EnvelopeRow segment="..." label="Business segments" detail="Shipment, reference, location, status, or response data" />
              <EnvelopeRow segment="SE" label="Transaction set ends" detail="SE02 must match the ST02 control number" accent />
            </div>
            <KnowledgeCheck
              legend="Which pair marks the beginning and end of one X12 transaction set?"
              selected={answers[4]}
              correctId="st-se"
              onSelect={(id) => setAnswers((current) => ({ ...current, 4: id }))}
              options={[
                { id: 'isa-gs', label: 'ISA and GS', explanation: 'Those are higher-level interchange and group envelopes.' },
                { id: 'st-se', label: 'ST and SE', explanation: 'Correct. ST begins the transaction set and SE closes it.' },
                { id: 'b2-l11', label: 'B2 and L11', explanation: 'Those are business-data segments inside certain transaction sets.' },
              ]}
            />
          </article>
        )}

        {lesson === 5 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-transaction-sets">
            <LessonIntro
              kicker="Know the four documents"
              title="The transaction number tells you what business conversation is happening."
              body="FreightBridge's training flow revolves around four X12 transaction sets. Two of them are acknowledgments, but they answer very different questions."
            />
            <div className="bootcamp-transaction-grid">
              <TransactionCard code="204" title="Load Tender" body="FreightBridge → Midwest. Offers the shipment to the carrier." />
              <TransactionCard code="997" title="Functional Acknowledgment" body="Technical acknowledgment. Says the X12 transaction was received/structurally acknowledged at the EDI level." />
              <TransactionCard code="990" title="Tender Response" body="Business response. Midwest accepts or rejects the offered load." accent />
              <TransactionCard code="214" title="Shipment Status" body="Midwest → FreightBridge. Reports shipment events such as pickup, transit, arrival, and delivery." />
            </div>
            <div className="bootcamp-warning">
              <strong>Critical distinction</strong>
              <span>A 997 does not mean the carrier accepted the load. The 990 carries the tender accept/reject decision.</span>
            </div>
            <KnowledgeCheck
              legend="FreightBridge receives a successful 997. Which later document tells you whether Midwest accepted the load?"
              selected={answers[5]}
              correctId="990"
              onSelect={(id) => setAnswers((current) => ({ ...current, 5: id }))}
              options={[
                { id: '204', label: '204', explanation: 'The 204 is the tender FreightBridge sends to Midwest.' },
                { id: '997', label: '997', explanation: 'The 997 is technical acknowledgment, not the carrier business decision.' },
                { id: '990', label: '990', explanation: 'Correct. The 990 is the carrier tender response.' },
                { id: '214', label: '214', explanation: 'The 214 reports shipment status after the load is moving.' },
              ]}
            />
          </article>
        )}

        {lesson === 6 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-correlation-mapping">
            <LessonIntro
              kicker="Keep one shipment connected"
              title="Correlation identifies the shipment. Mapping translates its meaning."
              body="FreightBridge normalizes partner-specific messages into a canonical shipment so the same business load can be followed across REST, JSON, X12, and status events."
            />
            <div className="bootcamp-correlation-flow">
              <ConceptCard icon={<Code2 size={22} />} title="Apex JSON">
                <code>loadId: LOAD500</code>
                <code>bol: BOL900</code>
                <code>po: PO111</code>
              </ConceptCard>
              <ArrowRight size={20} aria-hidden="true" />
              <ConceptCard icon={<Workflow size={22} />} title="Canonical Shipment" accent>
                <code>shipmentNumber: LOAD500</code>
                <span>One internal business identity.</span>
              </ConceptCard>
              <ArrowRight size={20} aria-hidden="true" />
              <ConceptCard icon={<FileText size={22} />} title="Midwest X12">
                <code>B2 ... LOAD500</code>
                <code>L11*BOL900*BM</code>
                <code>L11*PO111*PO</code>
              </ConceptCard>
            </div>
            <div className="bootcamp-status-map">
              <span><code>AF</code><strong>PICKED_UP</strong></span>
              <span><code>X6</code><strong>IN_TRANSIT</strong></span>
              <span><code>X1</code><strong>ARRIVED</strong></span>
              <span><code>D1</code><strong>DELIVERED</strong></span>
            </div>
            <KnowledgeCheck
              legend="Why does FreightBridge preserve shipment references across these formats?"
              selected={answers[6]}
              correctId="correlation"
              onSelect={(id) => setAnswers((current) => ({ ...current, 6: id }))}
              options={[
                { id: 'faster-sftp', label: 'To make the SFTP connection faster.', explanation: 'References identify business objects; they do not improve network speed.' },
                { id: 'correlation', label: 'To correlate messages and events to the correct canonical shipment.', explanation: 'Correct. Correlation lets FreightBridge connect partner-specific messages to one business shipment.' },
                { id: 'replace-997', label: 'To replace the need for a 997.', explanation: 'Correlation and technical acknowledgment solve different problems.' },
              ]}
            />
          </article>
        )}

        {lesson === 7 && (
          <article className="bootcamp-lesson" data-testid="bootcamp-ready">
            <LessonIntro
              kicker="Your mental model"
              title="Now you can read the flow before you troubleshoot it."
              body="The next module will show a healthy shipment in motion. Your goal there is not to fix anything—it is to learn what normal evidence looks like."
            />
            <div className="bootcamp-summary-grid">
              <SummaryItem title="Connection / exchange" body="Apex uses REST API over HTTP. Midwest exchanges files through SFTP." />
              <SummaryItem title="Message format" body="Apex sends JSON. Midwest sends and receives X12 EDI." />
              <SummaryItem title="Envelope" body="ISA / GS wrap groups; ST / SE wrap a transaction set. Version and controls matter." />
              <SummaryItem title="Business documents" body="204 tenders, 997 acknowledges technically, 990 decides the tender, 214 reports shipment status." />
              <SummaryItem title="Correlation" body="Business references tie partner messages back to the correct canonical shipment." />
              <SummaryItem title="FreightBridge" body="Receives, validates, normalizes, maps, translates, sends, and records observable evidence." />
            </div>
            <div className="bootcamp-ready-card">
              <CheckCircle2 size={24} />
              <div>
                <strong>Next: Healthy Integration</strong>
                <span>Watch one shipment move end to end so these concepts become concrete before any failure is introduced.</span>
              </div>
            </div>
          </article>
        )}
      </div>

      <footer className="bootcamp-actions">
        <button className="story-button story-button-secondary" type="button" onClick={goBack} disabled={lesson === 1}>
          <ArrowLeft size={17} /> Back
        </button>
        <div className="bootcamp-action-status" aria-live="polite">
          {!canContinue && <span>Choose the correct answer to continue.</span>}
        </div>
        {lesson < EDI_BOOTCAMP_LESSON_COUNT ? (
          <button className="story-button story-button-primary" type="button" onClick={goForward} disabled={!canContinue}>
            Continue <ArrowRight size={17} />
          </button>
        ) : (
          <button className="story-button story-button-primary" type="button" onClick={finishBootcamp}>
            Start Healthy Integration <ArrowRight size={17} />
          </button>
        )}
      </footer>
    </section>
  );
}

function LessonIntro({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="bootcamp-intro">
      <p>{kicker}</p>
      <h1>{title}</h1>
      <span>{body}</span>
    </div>
  );
}

function ConceptCard({
  icon,
  title,
  children,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={'bootcamp-concept-card ' + (accent ? 'accent' : '')}>
      <div className="bootcamp-concept-title">{icon}<strong>{title}</strong></div>
      <div className="bootcamp-concept-body">{children}</div>
    </div>
  );
}

function MiniFact({ title, body }: { title: string; body: string }) {
  return <div><strong>{title}</strong><span>{body}</span></div>;
}

function FlowNode({ label, detail, emphasis = false }: { label: string; detail: string; emphasis?: boolean }) {
  return (
    <div className={'bootcamp-flow-node ' + (emphasis ? 'emphasis' : '')}>
      <strong>{label}</strong><span>{detail}</span>
    </div>
  );
}

function EnvelopeRow({
  segment,
  label,
  detail,
  accent = false,
}: {
  segment: string;
  label: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={'bootcamp-envelope-row ' + (accent ? 'accent' : '')}>
      <code>{segment}</code>
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function TransactionCard({ code, title, body, accent = false }: { code: string; title: string; body: string; accent?: boolean }) {
  return (
    <div className={'bootcamp-transaction-card ' + (accent ? 'accent' : '')}>
      <code>{code}</code>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function SummaryItem({ title, body }: { title: string; body: string }) {
  return <div><strong>{title}</strong><span>{body}</span></div>;
}

function KnowledgeCheck({ legend, options, correctId, selected, onSelect }: KnowledgeCheckProps) {
  return (
    <fieldset className="bootcamp-check">
      <legend>{legend}</legend>
      <div className="bootcamp-check-options">
        {options.map((option) => {
          const checked = selected === option.id;
          return (
            <label key={option.id} className={checked ? 'selected' : ''}>
              <input
                type="radio"
                name={legend}
                value={option.id}
                checked={checked}
                onChange={() => onSelect(option.id)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {selected && (
        <div className={'bootcamp-check-feedback ' + (selected === correctId ? 'correct' : 'incorrect')} aria-live="polite">
          {options.find((option) => option.id === selected)?.explanation}
        </div>
      )}
    </fieldset>
  );
}

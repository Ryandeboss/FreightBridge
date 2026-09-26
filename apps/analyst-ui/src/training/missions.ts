import { BriefcaseBusiness, GitBranch, ShieldCheck, Truck } from 'lucide-react';
import type {
  Hint,
  HealthyCheckpoint,
  HealthyChecklistItem,
  KnowledgeCheckQuestion,
  MissionCommunication,
  MissionPhase,
  TeachingStep,
  TrainingEntity,
  TrainingMission,
  TrainingRole,
} from './types';

export const TRAINING_ROLE: TrainingRole = 'Integration Support Analyst';
export const LEARN_THE_FLOW_MISSION_ID = 'LEARN_THE_FLOW';
export const PLANNED_MISSION_COUNT = 10;

export const trainingMissions: TrainingMission[] = [
  {
    id: LEARN_THE_FLOW_MISSION_ID,
    slug: 'learn-the-flow',
    title: 'Mission 1 - Your First Shift',
    subtitle: 'Watch a Healthy Integration',
    difficulty: 'ORIENTATION',
    summary: 'Start inside FreightBridge and watch one clean shipment from the evidence your team can actually observe.',
    implemented: true,
  },
  {
    id: 'APEX_CANNOT_SEND',
    slug: 'apex-cannot-send',
    title: "Mission 2 - Apex Can't Get a Load Through",
    difficulty: 'BEGINNER',
    summary: 'Coming soon: investigate why an external partner says their request failed.',
    implemented: false,
    unlocksAfter: LEARN_THE_FLOW_MISSION_ID,
  },
  {
    id: 'REQUEST_CANNOT_BE_READ',
    slug: 'request-cannot-be-read',
    title: "Mission 3 - The Request Arrived, But It Can't Be Read",
    difficulty: 'BEGINNER',
    summary: 'Locked roadmap placeholder for malformed inbound evidence.',
    implemented: false,
  },
  {
    id: 'PAYLOAD_REJECTED',
    slug: 'payload-rejected',
    title: 'Mission 4 - The Payload Looks Fine, So Why Was It Rejected?',
    difficulty: 'INTERMEDIATE',
    summary: 'Locked roadmap placeholder for contract validation troubleshooting.',
    implemented: false,
  },
  {
    id: 'DUPLICATE_SHIPMENT',
    slug: 'duplicate-shipment',
    title: 'Mission 5 - Why Is This Shipment Showing Up Twice?',
    difficulty: 'INTERMEDIATE',
    summary: 'Locked roadmap placeholder for duplicate/idempotency investigation.',
    implemented: false,
  },
  {
    id: 'X12_ENVELOPE_MISMATCH',
    slug: 'x12-envelope-mismatch',
    title: "Mission 6 - The EDI Envelope Doesn't Match",
    difficulty: 'ADVANCED',
    summary: 'Locked roadmap placeholder for X12 control-number and envelope evidence.',
    implemented: false,
  },
  {
    id: 'STATUS_CALLBACK_MISSING',
    slug: 'status-callback-missing',
    title: 'Mission 7 - Midwest Sent the Status, Apex Never Got It',
    difficulty: 'ADVANCED',
    summary: 'Locked roadmap placeholder for outbound callback troubleshooting.',
    implemented: false,
  },
  {
    id: 'WRONG_X12_VERSION',
    slug: 'wrong-x12-version',
    title: 'Mission 8 - This Partner Is Sending the Wrong X12 Version',
    difficulty: 'ADVANCED',
    summary: 'Locked roadmap placeholder for unsupported X12 version evidence.',
    implemented: false,
  },
  {
    id: 'SFTP_STOPS_WORKING',
    slug: 'sftp-stops-working',
    title: 'Mission 9 - Midwest SFTP Suddenly Stops Working',
    difficulty: 'ADVANCED',
    summary: 'Locked roadmap placeholder for SFTP readiness and delivery failures.',
    implemented: false,
  },
  {
    id: 'PRODUCTION_INCIDENT',
    slug: 'production-incident',
    title: 'Mission 10 - Production Incident',
    difficulty: 'FINAL SHIFT',
    summary: 'Locked final-shift scenario placeholder. No incident is implemented yet.',
    implemented: false,
  },
];

export const trainingEntities: TrainingEntity[] = [
  {
    name: 'Apex Logistics',
    role: 'External Trading Partner - Broker / 3PL',
    perspective: 'external-partner',
    explanation: 'Apex has freight that needs to be moved and sends FreightBridge load requests.',
    communication: 'REST API + JSON. You can see the request FreightBridge received, not Apex internal logs.',
    icon: BriefcaseBusiness,
    testId: 'external-partner-apex',
  },
  {
    name: 'FreightBridge',
    role: 'Your Workplace - Integration Platform',
    perspective: 'learner-organization',
    explanation: 'FreightBridge connects trading partners that use different technologies and message formats.',
    communication: 'Receives, authenticates, validates, maps, translates, sends, tracks, and logs integration messages.',
    icon: ShieldCheck,
    testId: 'training-workplace-freightbridge',
  },
  {
    name: 'Midwest Carrier',
    role: 'External Trading Partner - Motor Carrier',
    perspective: 'external-partner',
    explanation: 'Midwest is the carrier that can accept the tender and physically move the freight.',
    communication: 'X12 004010 + SFTP. You can see files and responses FreightBridge exchanged, not Midwest private systems.',
    icon: Truck,
    testId: 'external-partner-midwest',
  },
];

export const firstShiftIntro: MissionCommunication = {
  kind: 'manager',
  from: 'Mike',
  role: 'Integration Manager',
  body:
    'Welcome aboard. Customers do not care that an API call failed or an EDI segment was wrong; they care that freight stopped moving. Your job is to prove what FreightBridge observed, explain where the flow stopped, and verify recovery. Before I give you incidents, I want you to see what normal looks like.',
};

export const missionOneBriefing: MissionCommunication = {
  kind: 'manager',
  from: 'Mike',
  role: 'Integration Manager',
  body:
    'Before I put you on an incident, I want you to know what a clean integration looks like. Follow one Apex load through FreightBridge and into Midwest. At every step, watch what we received, what FreightBridge did with it, and what evidence proves the next system received it. Later, when something breaks, you will compare the failed flow against this baseline.',
};

export const samplePartnerMessages: MissionCommunication[] = [
  {
    kind: 'partner',
    from: 'Apex Integration Support',
    role: 'External Partner Message',
    body: 'For production incidents, Apex would tell us what they sent and what response they received. FreightBridge still verifies that claim against our gateway and transaction evidence.',
  },
  {
    kind: 'partner',
    from: 'Midwest EDI Support',
    role: 'External Partner Message',
    body: 'For carrier-side questions, Midwest may report what their EDI team sees. FreightBridge treats that as partner communication, not direct access to Midwest internal systems.',
  },
];

export const missionOnePhases: MissionPhase[] = ['BRIEFING', 'INVESTIGATE', 'DEBRIEF'];

export const missionOneTimeline = [
  'Inbound request received from Apex',
  'Authentication passed',
  'JSON parsed',
  'Business validation passed',
  'Canonical shipment created',
  'Mapping selected',
  'X12 204 generated',
  'SFTP delivery attempted',
  'Midwest 997 received',
  'Midwest 990 received',
  'Midwest 214 received',
  'Apex callback sent',
];

export const missionOneHints: Hint[] = [
  {
    id: 'inbound',
    label: 'Hint 1 - Start with what FreightBridge received',
    body: 'For any partner complaint, first confirm whether FreightBridge received a request or file and which partner identity it used.',
  },
  {
    id: 'evidence',
    label: 'Hint 2 - Separate transport from business outcome',
    body: 'A 997 is transport/EDI structure evidence. The 990 is the carrier business decision.',
  },
  {
    id: 'status',
    label: 'Hint 3 - Check event time before received time',
    body: 'For shipment status, FreightBridge preserves event history and uses business event time to protect current status.',
  },
];

export const healthyCheckpoints: HealthyCheckpoint[] = [
  {
    id: 'inbound-apex',
    sequence: 1,
    title: 'Apex Reaches FreightBridge',
    shortLabel: 'Inbound',
    source: 'FreightBridge API Gateway',
    observed: 'Inbound REST/JSON request evidence from Apex Logistics.',
    whyItMatters: 'This proves the shipment reached the FreightBridge integration boundary. It does not prove Midwest has seen the load.',
    analystChecks: ['Partner identity is Apex Logistics', 'Transport is REST API', 'Format is JSON', 'A load/business identifier is present', 'No secrets or authorization values are exposed'],
    healthySignal: 'FreightBridge accepts the request into processing and creates correlated transaction evidence.',
    correlationFields: ['Load ID', 'Business Identifier', 'Lab Run ID'],
    questionId: 'inbound-does-not-prove-midwest',
  },
  {
    id: 'validation',
    sequence: 2,
    title: 'FreightBridge Accepts the Message',
    shortLabel: 'Validation',
    source: 'FreightBridge Inbound Processor',
    observed: 'Authentication, JSON parsing, partner identification, and business validation succeeded.',
    whyItMatters: 'Transport success only means a request arrived. Application validation proves FreightBridge can safely understand and process it.',
    analystChecks: ['Authentication passed', 'JSON was parseable', 'Required shipment fields are present', 'Business rules passed'],
    healthySignal: 'The inbound tender can move from raw partner request to canonical shipment processing.',
    correlationFields: ['Load ID', 'BOL', 'PO'],
  },
  {
    id: 'canonical',
    sequence: 3,
    title: 'FreightBridge Normalizes the Shipment',
    shortLabel: 'Canonical',
    source: 'FreightBridge Domain Processor',
    observed: 'A canonical shipment exists inside FreightBridge.',
    whyItMatters: 'FreightBridge converts partner-specific messages into one internal shipment language so Apex JSON is not tightly coupled to Midwest X12.',
    analystChecks: ['Load ID survived translation', 'Origin and destination survived translation', 'BOL and PO are preserved when available', 'Equipment, weight, pieces, and dates remain usable'],
    healthySignal: 'The canonical shipment has enough business data to map into the carrier 204.',
    correlationFields: ['Shipment Number', 'BOL', 'PO'],
  },
  {
    id: 'x12-204',
    sequence: 4,
    title: 'FreightBridge Builds the 204',
    shortLabel: '204',
    source: 'FreightBridge X12 Mapper',
    observed: 'FreightBridge generated an X12 204 Motor Carrier Load Tender for Midwest.',
    whyItMatters: 'The 204 asks Midwest, in plain English, "Will you haul this load?" Apex did not generate this EDI document.',
    analystChecks: ['Target partner is Midwest Carrier', 'X12 version is 004010', 'ST segment identifies transaction set 204', 'Required shipment fields mapped', 'Control numbers exist'],
    healthySignal: 'A safe 204 payload exists and can be correlated back to the Apex shipment.',
    correlationFields: ['ISA13', 'GS06', 'ST02', 'Load ID'],
    technicalDetails: 'ISA is the interchange envelope, GS is the functional group, and ST is the transaction set. ST*204 identifies a 204 load tender.',
    rawEvidenceTitle: 'Inspect Raw X12',
    questionId: 'who-created-204',
  },
  {
    id: 'sftp-delivery',
    sequence: 5,
    title: 'The 204 Leaves FreightBridge',
    shortLabel: 'SFTP',
    source: 'FreightBridge SFTP Transport',
    observed: 'FreightBridge recorded outbound SFTP delivery metadata for the 204.',
    whyItMatters: 'Document creation and document delivery are different. A 204 existing does not prove Midwest received it.',
    analystChecks: ['Outbound file name exists', 'Remote path is recorded', 'Delivery disposition succeeded', 'No credentials are exposed'],
    healthySignal: 'FreightBridge can show safe transport evidence for the outbound file.',
    correlationFields: ['File Name', 'Remote Path', '204 Control Numbers'],
    questionId: 'sftp-not-business-acceptance',
  },
  {
    id: 'x12-997',
    sequence: 6,
    title: 'Midwest Technically Acknowledges It',
    shortLabel: '997',
    source: 'Inbound Midwest EDI',
    observed: 'FreightBridge received a 997 Functional Acknowledgment from Midwest.',
    whyItMatters: 'A 997 proves Midwest received and structurally processed the EDI. It does not prove the carrier accepted the load.',
    analystChecks: ['Acknowledged group control number matches the 204', 'Acknowledged transaction control number matches the 204', 'AK5/AK9 status is accepted or rejected', 'Next expected business evidence is 990'],
    healthySignal: 'The 997 correlates to the outbound 204 and reports technical acceptance.',
    correlationFields: ['204 GS06', '204 ST02', '997 AK1', '997 AK2'],
    questionId: 'technical-ack',
  },
  {
    id: 'x12-990',
    sequence: 7,
    title: 'Midwest Makes the Business Decision',
    shortLabel: '990',
    source: 'Inbound Midwest EDI',
    observed: 'FreightBridge received a 990 Response to Load Tender.',
    whyItMatters: 'The 990 is the carrier business answer: accepted or rejected.',
    analystChecks: ['Decision is accepted or rejected', 'Decision correlates to the same load', 'FreightBridge updates the broker-facing side when applicable'],
    healthySignal: 'For this healthy run, the real tender result is accepted.',
    correlationFields: ['Load ID', 'Carrier Load Reference', 'BOL', 'PO'],
    questionId: 'tender-response',
  },
  {
    id: 'x12-214',
    sequence: 8,
    title: 'Shipment Status Starts Moving',
    shortLabel: '214',
    source: 'Inbound Midwest EDI',
    observed: 'FreightBridge received 214 shipment status events.',
    whyItMatters: 'The 214 reports what is happening to the shipment, such as picked up, in transit, arrived, and delivered.',
    analystChecks: ['AT7 status maps to a supported status', 'Business event time is captured', 'Received time may differ from event time', 'Apex-facing status is updated when applicable'],
    healthySignal: 'Status events correlate to the load and preserve event history without moving current status backward.',
    correlationFields: ['Load ID', '214 ST02', 'Event Time', 'Status Code'],
    questionId: 'status-message',
  },
  {
    id: 'apex-update',
    sequence: 9,
    title: 'FreightBridge Updates Apex',
    shortLabel: 'Apex Update',
    source: 'FreightBridge Outbound Partner Update',
    observed: 'FreightBridge verifies broker-facing tender/status evidence from the Apex side of the integration.',
    whyItMatters: 'The learner should verify FreightBridge-side callback or reconciliation evidence, not Apex private systems.',
    analystChecks: ['Destination partner is Apex', 'Business result/status is normalized', 'Safe response metadata or reconciliation exists'],
    healthySignal: 'Apex-facing tender/status evidence matches what FreightBridge processed from Midwest.',
    correlationFields: ['Load ID', 'Tender Status', 'Shipment Status'],
  },
  {
    id: 'healthy-confirmed',
    sequence: 10,
    title: 'Healthy Flow Confirmed',
    shortLabel: 'Healthy',
    source: 'FreightBridge Training Review',
    observed: 'The full shipment lifecycle completed successfully.',
    whyItMatters: 'This is your baseline. Future incident missions compare a broken flow against these healthy checkpoints.',
    analystChecks: ['Identify the last healthy checkpoint', 'Confirm the evidence does not stop early', 'Summarize what normal looks like'],
    healthySignal: 'Inbound, mapping, delivery, technical acknowledgment, business response, status flow, and broker-facing update evidence are complete.',
    correlationFields: ['Load ID', 'Lab Run ID', 'Transaction IDs'],
  },
];

export const inboundRequestQuestion: KnowledgeCheckQuestion = {
  id: 'inbound-does-not-prove-midwest',
  prompt: 'Does receiving the Apex request prove Midwest has seen the load?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
  correctOptionId: 'no',
  explanation: 'Correct: the request reached FreightBridge, but no Midwest evidence exists yet.',
};

export const generated204Question: KnowledgeCheckQuestion = {
  id: 'who-created-204',
  prompt: 'Who created the X12 204 for Midwest?',
  options: [
    { id: 'apex', label: 'Apex Logistics' },
    { id: 'freightbridge', label: 'FreightBridge' },
    { id: 'midwest', label: 'Midwest Carrier' },
  ],
  correctOptionId: 'freightbridge',
  explanation: 'Correct: FreightBridge generated the 204 from the Apex request and canonical shipment.',
};

export const sftpDeliveryQuestion: KnowledgeCheckQuestion = {
  id: 'sftp-not-business-acceptance',
  prompt: 'Does successful SFTP delivery mean Midwest accepted the load?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
  correctOptionId: 'no',
  explanation: 'Correct: SFTP only proves delivery evidence. The 990 carries the business decision.',
};

export const missionOneTeachingSteps: TeachingStep[] = [
  {
    id: 'inbound-request',
    title: 'FreightBridge received an inbound request from Apex',
    plainLanguage: 'From your workstation, the first fact is not what Apex did internally. It is that FreightBridge received an authenticated REST/JSON load request from Apex.',
    advancedDetails: 'The real Lab run creates an Apex load and dispatches it through the existing FreightBridge inbound API path.',
    source: 'FreightBridge API Gateway',
    observed: 'Inbound REST/JSON request from APEX',
    analystCheck: ['Did FreightBridge receive it?', 'Which partner sent it?', 'What HTTP response did FreightBridge return?'],
  },
  {
    id: 'canonical-model',
    title: 'FreightBridge created a canonical shipment',
    plainLanguage: 'FreightBridge translated the partner-specific JSON into its internal shipment language before generating any EDI.',
    advancedDetails: 'The Canonical Shipment Model keeps Apex JSON from being tightly coupled to Midwest X12.',
    source: 'FreightBridge Domain Processor',
    observed: 'Canonical shipment data available',
    analystCheck: ['Did parsing succeed?', 'Did business validation pass?', 'Was a canonical shipment created?'],
  },
  {
    id: 'x12-204',
    title: 'FreightBridge generated an X12 204 for Midwest',
    plainLanguage: 'The X12 204 Motor Carrier Load Tender asks Midwest whether they will haul the load.',
    advancedDetails: 'Apex did not send this 204. FreightBridge generated it from Apex JSON, canonical shipment data, and the active Midwest mapping profile.',
    source: 'FreightBridge X12 Mapper',
    observed: '204 Motor Carrier Load Tender generated',
    analystCheck: ['Was the mapping successful?', 'Which mapping profile was used?', 'Was X12 produced safely?'],
  },
  {
    id: 'sftp',
    title: 'FreightBridge attempted SFTP delivery',
    plainLanguage: "FreightBridge placed the 204 in Midwest's SFTP inbox using its configured transport.",
    advancedDetails: 'Transport evidence includes file name, remote path, archive/error handling, host-key verification, and delivery disposition.',
    source: 'FreightBridge SFTP Transport',
    observed: '204 upload metadata visible to FreightBridge',
    analystCheck: ['Was an upload attempted?', 'Which remote path was used?', 'Did delivery report success or failure?'],
  },
  {
    id: 'x12-997',
    title: 'FreightBridge received a 997 from Midwest',
    plainLanguage: 'The 997 means Midwest technically acknowledged the EDI document structure. It does not mean they accepted the load.',
    advancedDetails: 'A 997 is a functional acknowledgment. It correlates back to the outbound 204 controls.',
    source: 'Inbound Midwest EDI',
    observed: '997 functional acknowledgment received',
    analystCheck: ['Did Midwest technically acknowledge the document?', 'Which 204 controls were acknowledged?'],
  },
  {
    id: 'x12-990',
    title: 'FreightBridge received a 990 tender response',
    plainLanguage: 'The 990 tells FreightBridge whether Midwest accepted or rejected the actual load tender.',
    advancedDetails: '997 = technical acknowledgment. 990 = business tender decision.',
    source: 'Inbound Midwest EDI',
    observed: '990 tender response received',
    analystCheck: ['Was the tender accepted or rejected?', 'Did FreightBridge update Apex?'],
  },
  {
    id: 'x12-214',
    title: 'FreightBridge received 214 shipment updates',
    plainLanguage: 'The 214 tells FreightBridge which shipment event Midwest reported, such as picked up, in transit, arrived, or delivered.',
    advancedDetails: 'FreightBridge maps AF to PICKED_UP, X6 to IN_TRANSIT, X1 to ARRIVED, and D1 to DELIVERED.',
    source: 'Inbound Midwest EDI',
    observed: '214 shipment event history received',
    analystCheck: ['Which business event occurred?', 'What timestamp did Midwest report?', 'Was Apex notified?'],
  },
  {
    id: 'out-of-order',
    title: 'FreightBridge protects current shipment status',
    plainLanguage: 'Messages can arrive out of order. FreightBridge keeps the full history and protects current status using event time.',
    advancedDetails: 'If DELIVERED is received before a late ARRIVED message, FreightBridge keeps both events in history but leaves current shipment status as DELIVERED.',
    source: 'FreightBridge Shipment Status Processor',
    observed: 'Event history preserved with current status protected',
    analystCheck: ['Did event time differ from received time?', 'Was current status changed correctly?'],
  },
];

export const technicalAckQuestion: KnowledgeCheckQuestion = {
  id: 'technical-ack',
  prompt: 'From your FreightBridge workstation, you see a 997 from Midwest. Does that mean Midwest accepted the load?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
  correctOptionId: 'no',
  explanation: 'Correct: the 997 only confirms the EDI document was received and structurally processed. The 990 carries the business acceptance or rejection.',
};

export const tenderResponseQuestion: KnowledgeCheckQuestion = {
  id: 'tender-response',
  prompt: 'Which message tells FreightBridge whether Midwest accepted the actual load?',
  options: [
    { id: '204', label: '204' },
    { id: '997', label: '997' },
    { id: '990', label: '990' },
    { id: '214', label: '214' },
  ],
  correctOptionId: '990',
  explanation: 'Correct: the 990 is the tender response. It is the carrier business decision.',
};

export const statusMessageQuestion: KnowledgeCheckQuestion = {
  id: 'status-message',
  prompt: 'Which transaction communicates shipment status?',
  options: [
    { id: '204', label: '204' },
    { id: '997', label: '997' },
    { id: '990', label: '990' },
    { id: '214', label: '214' },
  ],
  correctOptionId: '214',
  explanation: 'Correct: the 214 carries shipment status updates.',
};

export const checkpointQuestions: KnowledgeCheckQuestion[] = [
  inboundRequestQuestion,
  generated204Question,
  sftpDeliveryQuestion,
  technicalAckQuestion,
  tenderResponseQuestion,
  statusMessageQuestion,
];

export const finalQuizQuestions = checkpointQuestions;

export const healthyChecklistItems: HealthyChecklistItem[] = [
  { id: 'inbound', label: 'Inbound request reached FreightBridge', evidence: 'Apex REST/JSON evidence exists for the load.' },
  { id: 'validation', label: 'Authentication, parsing, and validation succeeded', evidence: 'The load moved into FreightBridge processing.' },
  { id: 'canonical', label: 'Canonical shipment was created', evidence: 'Shipment data survived translation into FreightBridge format.' },
  { id: 'x12', label: 'FreightBridge generated the 204', evidence: 'X12 004010 204 and control metadata exist.' },
  { id: 'sftp', label: 'SFTP transport succeeded', evidence: 'Outbound file and remote path evidence exist.' },
  { id: 'ack997', label: '997 technically acknowledged the EDI', evidence: 'AK1/AK2 correlation confirms the 204 was acknowledged.' },
  { id: 'response990', label: '990 provided the business acceptance', evidence: 'Tender status is accepted for this healthy run.' },
  { id: 'events214', label: '214 events were processed', evidence: 'Shipment status history is available.' },
  { id: 'currentStatus', label: 'Current shipment status is correct', evidence: 'FreightBridge protects current status while preserving history.' },
  { id: 'lastHealthy', label: 'Last Healthy Checkpoint is the completed lifecycle', evidence: 'The full scenario reached SUCCEEDED.' },
];

export const missionPhases: MissionPhase[] = ['BRIEFING', 'INVESTIGATE', 'DIAGNOSE', 'PLAN', 'ACT', 'VERIFY', 'REPORT', 'DEBRIEF'];
export const flowIcon = GitBranch;

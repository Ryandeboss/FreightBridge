import { BriefcaseBusiness, GitBranch, ShieldCheck, Truck } from 'lucide-react';
import type {
  Hint,
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
    'We support Apex Logistics and Midwest Carrier. Apex sends us load requests through an API. Midwest expects EDI files through SFTP. Today you are not fixing anything; watch one clean shipment from your FreightBridge workstation so you know what healthy evidence looks like.',
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

export const finalQuizQuestions: KnowledgeCheckQuestion[] = [
  {
    id: 'apex-role',
    prompt: 'Who is Apex in your FreightBridge evidence?',
    options: [
      { id: 'broker', label: 'External broker / 3PL partner' },
      { id: 'carrier', label: 'Internal FreightBridge carrier team' },
      { id: 'middleware', label: 'FreightBridge integration middleware' },
    ],
    correctOptionId: 'broker',
    explanation: 'Apex is an external broker / 3PL partner that sends FreightBridge load requests.',
  },
  {
    id: 'midwest-role',
    prompt: 'Who is Midwest?',
    options: [
      { id: 'carrier', label: 'External motor carrier partner' },
      { id: 'broker', label: 'Internal broker desk' },
      { id: 'dashboard', label: 'Dashboard vendor' },
    ],
    correctOptionId: 'carrier',
    explanation: 'Midwest is the external motor carrier that can haul the freight.',
  },
  {
    id: 'who-generates-204',
    prompt: 'Who generates the Midwest X12 204 in this project?',
    options: [
      { id: 'apex', label: 'Apex Logistics' },
      { id: 'freightbridge', label: 'FreightBridge' },
      { id: 'midwest', label: 'Midwest Carrier' },
    ],
    correctOptionId: 'freightbridge',
    explanation: 'FreightBridge generates the 204 from the Apex JSON/canonical shipment.',
  },
  {
    id: '997-meaning',
    prompt: 'What does the 997 mean?',
    options: [
      { id: 'technical', label: 'Technical acknowledgment' },
      { id: 'business', label: 'Load acceptance' },
      { id: 'status', label: 'Shipment status' },
    ],
    correctOptionId: 'technical',
    explanation: 'A 997 is a technical acknowledgment, not load acceptance.',
  },
  {
    id: 'status-message',
    prompt: 'What message carries shipment status?',
    options: [
      { id: '204', label: '204' },
      { id: '997', label: '997' },
      { id: '990', label: '990' },
      { id: '214', label: '214' },
    ],
    correctOptionId: '214',
    explanation: 'The 214 carries shipment status updates.',
  },
];

export const missionPhases: MissionPhase[] = ['BRIEFING', 'INVESTIGATE', 'DIAGNOSE', 'PLAN', 'ACT', 'VERIFY', 'REPORT', 'DEBRIEF'];
export const flowIcon = GitBranch;

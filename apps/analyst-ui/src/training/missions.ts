import { BriefcaseBusiness, GitBranch, ShieldCheck, Truck } from 'lucide-react';
import type { KnowledgeCheckQuestion, TeachingStep, TrainingEntity, TrainingMission } from './types';

export const LEARN_THE_FLOW_MISSION_ID = 'LEARN_THE_FLOW';
export const PLANNED_MISSION_COUNT = 9;

export const trainingMissions: TrainingMission[] = [
  {
    id: LEARN_THE_FLOW_MISSION_ID,
    slug: 'learn-the-flow',
    title: 'Mission 1 - Learn the Flow',
    difficulty: 'Tutorial',
    summary: 'Follow a successful shipment from Apex to FreightBridge to Midwest and back.',
    implemented: true,
  },
  {
    id: 'AUTHENTICATION_TROUBLE',
    slug: 'authentication-trouble',
    title: 'Mission 2 - Authentication Trouble',
    difficulty: 'Beginner',
    summary: 'Coming in the next milestone.',
    implemented: false,
    unlocksAfter: LEARN_THE_FLOW_MISSION_ID,
  },
  {
    id: 'BROKEN_JSON',
    slug: 'broken-json',
    title: 'Mission 3 - Broken JSON',
    difficulty: 'Beginner',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'CONTRACT_VALIDATION',
    slug: 'contract-validation',
    title: 'Mission 4 - Contract Validation',
    difficulty: 'Intermediate',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'DUPLICATE_SHIPMENT',
    slug: 'duplicate-shipment',
    title: 'Mission 5 - Duplicate Shipment',
    difficulty: 'Intermediate',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'X12_CONTROL_NUMBERS',
    slug: 'x12-control-numbers',
    title: 'Mission 6 - X12 Control Numbers',
    difficulty: 'Advanced',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'MAPPING_FAILURE',
    slug: 'mapping-failure',
    title: 'Mission 7 - Mapping Failure',
    difficulty: 'Advanced',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'WRONG_X12_VERSION',
    slug: 'wrong-x12-version',
    title: 'Mission 8 - Wrong X12 Version',
    difficulty: 'Advanced',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
  {
    id: 'SFTP_TRUST_FAILURE',
    slug: 'sftp-trust-failure',
    title: 'Mission 9 - SFTP Trust Failure',
    difficulty: 'Advanced',
    summary: 'Locked training roadmap placeholder.',
    implemented: false,
  },
];

export const trainingEntities: TrainingEntity[] = [
  {
    name: 'Apex Logistics',
    role: 'Broker / 3PL',
    explanation: 'Apex has freight that needs to be moved. It finds a carrier to haul the load.',
    communication: 'REST API / JSON. Apex sends load information as JSON to FreightBridge; Apex does not create the X12 204 directly.',
    icon: BriefcaseBusiness,
  },
  {
    name: 'FreightBridge',
    role: 'Integration Middleware',
    explanation: 'FreightBridge sits between the two companies. It translates message formats, moves information between them, and keeps a record of what happened.',
    communication: 'Receives JSON, validates it, maps it to the canonical shipment model, creates X12, exchanges files, translates responses, and records transactions, logs, and errors.',
    icon: ShieldCheck,
  },
  {
    name: 'Midwest Carrier',
    role: 'Motor Carrier / Trucking Company',
    explanation: 'Midwest is the trucking company that can accept the load and physically move the freight.',
    communication: 'X12 004010 / SFTP inside this simulator.',
    icon: Truck,
  },
];

export const missionOneTeachingSteps: TeachingStep[] = [
  {
    id: 'apex-load',
    title: 'Apex has a shipment that needs a truck',
    plainLanguage: 'Apex starts with shipment details: where the freight begins, where it needs to go, and the references used to track it.',
    advancedDetails: 'Apex sends a load tender payload to FreightBridge as JSON over REST.',
  },
  {
    id: 'canonical-model',
    title: 'FreightBridge translates into one internal language',
    plainLanguage: 'FreightBridge converts Apex’s version of the shipment into its own standard internal shipment format.',
    advancedDetails: 'This is the Canonical Shipment Model. It keeps Apex JSON from being tightly coupled to Midwest X12.',
  },
  {
    id: 'x12-204',
    title: 'FreightBridge creates the 204',
    plainLanguage: 'The X12 204 Motor Carrier Load Tender asks Midwest: will you haul this load?',
    advancedDetails: 'Apex did not send this 204. FreightBridge generated it from Apex JSON and the canonical shipment.',
  },
  {
    id: 'sftp',
    title: 'FreightBridge delivers the X12 file through SFTP',
    plainLanguage: 'SFTP is a secure way for systems to exchange files. FreightBridge places the 204 in the carrier’s inbox.',
    advancedDetails: 'Advanced transport details include host-key verification, atomic upload/rename, and inbound/outbound/archive/error folders.',
  },
  {
    id: 'x12-997',
    title: 'Midwest sends a 997 technical acknowledgment',
    plainLanguage: 'The 997 means Midwest received the EDI document and could process its structure.',
    advancedDetails: 'A 997 does not mean Midwest accepted the actual load. It is a technical acknowledgment, not a business decision.',
  },
  {
    id: 'x12-990',
    title: 'Midwest sends a 990 tender response',
    plainLanguage: 'The 990 tells Apex whether Midwest accepts or rejects the actual load.',
    advancedDetails: '997 = technical acknowledgment. 990 = business decision.',
  },
  {
    id: 'x12-214',
    title: 'Midwest sends 214 shipment statuses',
    plainLanguage: 'The 214 tells FreightBridge what is happening to the shipment: picked up, in transit, arrived, and delivered.',
    advancedDetails: 'FreightBridge maps AF to PICKED_UP, X6 to IN_TRANSIT, X1 to ARRIVED, and D1 to DELIVERED.',
  },
  {
    id: 'out-of-order',
    title: 'Business event time matters',
    plainLanguage: 'Systems do not always receive messages in the same order the real events happened.',
    advancedDetails: 'If DELIVERED is received before a late ARRIVED message, FreightBridge keeps both events in history but leaves the current shipment status as DELIVERED.',
  },
];

export const technicalAckQuestion: KnowledgeCheckQuestion = {
  id: 'technical-ack',
  prompt: 'Midwest sent a 997. Has Midwest accepted the load yet?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
  correctOptionId: 'no',
  explanation: 'Correct: the 997 only confirms the EDI document was received and structurally processed. The 990 carries the business acceptance or rejection.',
};

export const tenderResponseQuestion: KnowledgeCheckQuestion = {
  id: 'tender-response',
  prompt: 'Which message tells Apex whether Midwest accepted the actual load?',
  options: [
    { id: '204', label: '204' },
    { id: '997', label: '997' },
    { id: '990', label: '990' },
    { id: '214', label: '214' },
  ],
  correctOptionId: '990',
  explanation: 'Correct: the 990 is the tender response. It is the carrier’s business decision.',
};

export const finalQuizQuestions: KnowledgeCheckQuestion[] = [
  {
    id: 'apex-role',
    prompt: 'Who is Apex?',
    options: [
      { id: 'broker', label: 'Broker / 3PL' },
      { id: 'carrier', label: 'Carrier / trucking company' },
      { id: 'middleware', label: 'Integration middleware' },
    ],
    correctOptionId: 'broker',
    explanation: 'Apex is the broker / 3PL that has freight to move.',
  },
  {
    id: 'midwest-role',
    prompt: 'Who is Midwest?',
    options: [
      { id: 'carrier', label: 'Carrier / trucking company' },
      { id: 'broker', label: 'Broker / 3PL' },
      { id: 'dashboard', label: 'Dashboard vendor' },
    ],
    correctOptionId: 'carrier',
    explanation: 'Midwest is the motor carrier that can haul the freight.',
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

export const missionPhases = ['BRIEFING', 'INVESTIGATE', 'DIAGNOSE', 'PLAN', 'ACT', 'VERIFY', 'REPORT', 'DEBRIEF'] as const;
export const flowIcon = GitBranch;

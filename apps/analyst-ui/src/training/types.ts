import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export type TrainingRole = 'Integration Support Analyst';
export type MissionDifficulty = 'ORIENTATION' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'FINAL SHIFT';
export type MissionStatus = 'available' | 'completed' | 'coming-soon' | 'locked';
export type MissionPhase = 'BRIEFING' | 'INVESTIGATE' | 'DIAGNOSE' | 'PLAN' | 'ACT' | 'VERIFY' | 'REPORT' | 'DEBRIEF';
export type CommunicationKind = 'manager' | 'partner';
export type EvidenceType =
  | 'Inbound API Request'
  | 'Outbound API Callback'
  | 'Transaction Record'
  | 'Processing Log'
  | 'Integration Error'
  | 'X12 Document'
  | 'SFTP Activity'
  | 'Partner Message'
  | 'Mapping Information'
  | 'Business Trace'
  | 'Shipment Status History';

export type TrainingProgress = {
  version: 1;
  completedMissions: string[];
};

export type TrainingMission = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  difficulty: MissionDifficulty;
  summary: string;
  implemented: boolean;
  unlocksAfter?: string;
};

export type TrainingEntity = {
  name: string;
  role: string;
  perspective: 'learner-organization' | 'external-partner';
  explanation: string;
  communication: string;
  icon: ComponentType<LucideProps>;
  testId?: string;
};

export type MissionCommunication = {
  kind: CommunicationKind;
  from: string;
  role: string;
  body: string;
};

export type TrainingEvidence = {
  id: string;
  type: EvidenceType;
  source: string;
  summary: string;
  observed: string;
  meaning: string;
  timestamp?: string;
  businessIdentifier?: string;
  raw?: unknown;
};

export type Hint = {
  id: string;
  label: string;
  body: string;
};

export type KnowledgeCheckOption = {
  id: string;
  label: string;
};

export type KnowledgeCheckQuestion = {
  id: string;
  prompt: string;
  options: KnowledgeCheckOption[];
  correctOptionId: string;
  explanation: string;
};

export type TeachingStep = {
  id: string;
  title: string;
  plainLanguage: string;
  advancedDetails?: string;
  source: string;
  observed: string;
  analystCheck: string[];
};

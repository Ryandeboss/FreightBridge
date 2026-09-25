import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export type MissionDifficulty = 'Tutorial' | 'Beginner' | 'Intermediate' | 'Advanced';
export type MissionStatus = 'available' | 'completed' | 'coming-soon' | 'locked';
export type MissionPhase = 'BRIEFING' | 'INVESTIGATE' | 'DIAGNOSE' | 'PLAN' | 'ACT' | 'VERIFY' | 'REPORT' | 'DEBRIEF';

export type TrainingProgress = {
  version: 1;
  completedMissions: string[];
};

export type TrainingMission = {
  id: string;
  slug: string;
  title: string;
  difficulty: MissionDifficulty;
  summary: string;
  implemented: boolean;
  unlocksAfter?: string;
};

export type TrainingEntity = {
  name: string;
  role: string;
  explanation: string;
  communication: string;
  icon: ComponentType<LucideProps>;
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
};

export type AgentRole =
  | 'ceo'
  | 'engineer'
  | 'growth'
  | 'marketing'
  | 'product'
  | 'operations'
  | 'sales'
  | 'support'
  | 'data-analyst'
  | 'customer-success';

export type AgentStatus = 'idle' | 'working' | 'completed' | 'error';

export type AutonomyLevel = 'full-auto' | 'approve-big' | 'manual';

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  title: string;
  icon: string;
  status: AgentStatus;
  currentTask: string | null;
  autonomyLevel: AutonomyLevel;
}

export interface AgentActivity {
  id: string;
  agentRole: AgentRole;
  agentName: string;
  action: string;
  detail: string;
  timestamp: string;
  type: 'action' | 'insight' | 'milestone' | 'alert';
}

export interface KPIMetric {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface Company {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  goal: 'revenue' | 'users' | 'launch' | 'brand';
  adBudget: string;
  plan: 'starter' | 'growth' | 'scale';
  createdAt: string;
}

export interface OnboardingState {
  step: number;
  idea: string;
  goal: 'revenue' | 'users' | 'launch' | 'brand' | null;
  adBudget: string | null;
}

export interface CommandMessage {
  id: string;
  role: 'user' | 'agent';
  agentRole?: AgentRole;
  agentName?: string;
  content: string;
  timestamp: string;
}

export interface WeeklyRetro {
  id: string;
  summary: string;
  topInsight: string;
  agentPerformance: { role: AgentRole; score: number; highlight: string }[];
  createdAt: string;
}

export const AGENTS: Omit<Agent, 'id' | 'status' | 'currentTask'>[] = [
  { role: 'ceo', name: 'Atlas', title: 'CEO & Strategist', icon: '🎯', autonomyLevel: 'full-auto' },
  { role: 'engineer', name: 'Forge', title: 'Engineer', icon: '⚡', autonomyLevel: 'full-auto' },
  { role: 'growth', name: 'Pulse', title: 'Growth Lead', icon: '📈', autonomyLevel: 'full-auto' },
  { role: 'marketing', name: 'Echo', title: 'Marketing', icon: '✍️', autonomyLevel: 'full-auto' },
  { role: 'product', name: 'Prism', title: 'Product Manager', icon: '💎', autonomyLevel: 'full-auto' },
  { role: 'operations', name: 'Nexus', title: 'Operations', icon: '⚙️', autonomyLevel: 'full-auto' },
  { role: 'sales', name: 'Arrow', title: 'Sales', icon: '📧', autonomyLevel: 'full-auto' },
  { role: 'support', name: 'Shield', title: 'Support', icon: '🛡️', autonomyLevel: 'full-auto' },
  { role: 'data-analyst', name: 'Lens', title: 'Data Analyst', icon: '📊', autonomyLevel: 'full-auto' },
  { role: 'customer-success', name: 'Bloom', title: 'Customer Success', icon: '🌱', autonomyLevel: 'full-auto' },
];

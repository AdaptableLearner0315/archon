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

// ============================================================
// Intelligence Layer Types
// ============================================================

// --- Message Bus Types ---
export type MessageType = 'request' | 'response' | 'broadcast' | 'delegation';
export type MessagePriority = 'normal' | 'urgent';

export interface AgentMessage {
  id: string;
  cycleId: string;
  companyId: string;
  fromRole: AgentRole;
  toRole: AgentRole | null; // null = broadcast
  type: MessageType;
  priority: MessagePriority;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  correlationId: string | null; // links response to request
  createdAt: string;
}

export interface MessageBusContext {
  cycleId: string;
  companyId: string;
  messageLog: AgentMessage[];
}

// --- Memory Types ---
export type MemoryType = 'decision' | 'insight' | 'task_result' | 'conversation_summary' | 'error' | 'delegation';

export interface WorkingMemoryEntry {
  key: string;
  agentRole: AgentRole;
  value: unknown;
  createdAt: number; // timestamp ms
  lastAccessedAt: number;
}

export interface ShortTermMemory {
  id: string;
  companyId: string;
  agentRole: AgentRole;
  topic: string;
  content: string;
  memoryType: MemoryType;
  relevanceScore: number;
  expiresAt: string;
  createdAt: string;
}

export type LongTermCategory = 'pattern' | 'strategy' | 'company_knowledge' | 'agent_behavior' | 'market_insight';

export interface LongTermMemory {
  id: string;
  companyId: string;
  agentRole: AgentRole;
  category: LongTermCategory;
  summary: string;
  confidence: number;
  timesReferenced: number;
  lastReferencedAt: string;
  createdAt: string;
}

export interface MemoryContext {
  workingMemory: WorkingMemoryEntry[];
  shortTermMemories: ShortTermMemory[];
  longTermMemories: LongTermMemory[];
  tokenEstimate: number;
}

// --- Self-Improvement Types ---
export interface AgentPerformanceRecord {
  id: string;
  companyId: string;
  cycleId: string;
  agentRole: AgentRole;
  tasksCompleted: number;
  tasksFailed: number;
  avgQualityScore: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  score: number; // composite 0-100
  createdAt: string;
}

export interface CycleRetrospective {
  cycleId: string;
  companyId: string;
  whatWorked: string[];
  whatDidnt: string[];
  agentScores: { role: AgentRole; score: number; feedback: string }[];
  suggestedPromptChanges: { role: AgentRole; suggestion: string }[];
  overallScore: number;
  createdAt: string;
}

export interface PromptVersion {
  id: string;
  companyId: string;
  agentRole: AgentRole;
  version: number;
  promptText: string;
  isActive: boolean;
  performanceBefore: number | null;
  performanceAfter: number | null;
  createdAt: string;
}

// --- Operating Cycle Types ---
export type CycleStatus = 'pending' | 'planning' | 'executing' | 'completing' | 'notifying' | 'done' | 'failed';
export type CycleTrigger = 'manual' | 'scheduled' | 'api';
export type TaskStatus = 'pending' | 'running' | 'needs_data' | 'completed' | 'failed' | 'blocked';

export interface CycleTask {
  id: string;
  cycleId: string;
  agentRole: AgentRole;
  agentName: string;
  description: string;
  status: TaskStatus;
  result: string | null;
  dependsOn: string[]; // task IDs
  tokensUsed: number;
  costUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface CyclePlan {
  directive: string;
  tasks: {
    agentRole: AgentRole;
    description: string;
    priority: number;
    dependsOn: AgentRole[];
  }[];
  reasoning: string;
}

export interface OperatingCycle {
  id: string;
  companyId: string;
  status: CycleStatus;
  trigger: CycleTrigger;
  plan: CyclePlan | null;
  userDirective: string | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface CycleStreamEvent {
  type: 'cycle_status' | 'task_status' | 'agent_thinking' | 'agent_text' | 'agent_done' | 'cycle_done' | 'error';
  cycleId: string;
  taskId?: string;
  agentRole?: AgentRole;
  agentName?: string;
  content?: string;
  status?: string;
  timestamp: string;
}

// --- Notification Types ---
export interface NotificationPreferences {
  id: string;
  companyId: string;
  emailEnabled: boolean;
  emailAddress: string | null;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  digestFormat: 'brief' | 'detailed';
}

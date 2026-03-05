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
  | 'customer-success'
  | 'seo'    // Scout - SEO Specialist (Scale tier)
  | 'ads';  // Spark - Ads Manager (Scale tier)

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
  type: 'action' | 'insight' | 'milestone' | 'alert' | 'team';
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
  // Scale tier SEO/Ads fields
  websiteUrl?: string | null;
  dailyAdBudget?: number;
  seoEnabled?: boolean;
  adsEnabled?: boolean;
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
  // Scale tier agents
  { role: 'seo', name: 'Scout', title: 'SEO Specialist', icon: '🔍', autonomyLevel: 'full-auto' },
  { role: 'ads', name: 'Spark', title: 'Ads Manager', icon: '💰', autonomyLevel: 'approve-big' },
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
  companyMemories?: CompanyMemory[];
  tokenEstimate: number;
}

// --- Cognitive Memory Types (Company-Wide) ---
export type MemoryDomain = 'business_context' | 'competitors' | 'market' | 'agents';
export type MemorySource = 'onboarding' | 'agent' | 'user' | 'consolidation' | 'inference';

export interface CompanyMemory {
  id: string;
  companyId: string;
  domain: MemoryDomain;
  scope: string; // Hierarchical path: "/business/target_audience"
  topic: string;
  content: string;
  importance: number; // 0-1
  confidence: number; // 0-1
  halfLifeDays: number;
  source: MemorySource;
  sourceAgent: string | null;
  sourceCycleId: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  timesAccessed: number;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
  // Advanced cognitive features
  embedding?: number[]; // 1536-dimensional vector for semantic search
  reinforcementCount?: number; // How many sources confirmed this fact
  expiresAt: string | null;
  isArchived: boolean;
}

export interface CompanyMemoryInput {
  companyId: string;
  domain: MemoryDomain;
  scope: string;
  topic: string;
  content: string;
  importance?: number;
  confidence?: number;
  halfLifeDays?: number;
  source?: MemorySource;
  sourceAgent?: string;
  sourceCycleId?: string;
}

export interface MemoryRecallOptions {
  companyId: string;
  domain?: MemoryDomain;
  scope?: string; // Prefix match
  query?: string; // Topic/content search
  limit?: number;
  minImportance?: number;
  minConfidence?: number;
  includeArchived?: boolean;
  // Scoring weights
  weightImportance?: number;
  weightConfidence?: number;
  weightRecency?: number;
  weightFrequency?: number;
}

export interface MemoryRecallResult {
  memory: CompanyMemory;
  score: number;
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
  needsHumanInput: boolean;
  humanInputQuestion: string | null;
  humanInputResponse: string | null;
  humanInputRespondedAt: string | null;
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
  type:
    | 'cycle_status'
    | 'task_status'
    | 'agent_thinking'
    | 'agent_text'
    | 'agent_done'
    | 'cycle_done'
    | 'human_input_needed'
    | 'error'
    // Team task events
    | 'team_task_started'
    | 'team_task_merging'
    | 'team_task_completed'
    | 'team_task_partial_failure';
  cycleId: string;
  taskId?: string;
  agentRole?: AgentRole;
  agentName?: string;
  content?: string;
  status?: string;
  timestamp: string;
  // Team task specific fields
  teamTaskId?: string;
  agents?: AgentRole[];
}

// --- Notification Types ---
export type DigestFrequency = 'hourly' | '6h' | 'daily' | 'weekly';

export interface NotificationPreferences {
  id: string;
  companyId: string;
  emailEnabled: boolean;
  emailAddress: string | null;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  digestFormat: 'brief' | 'detailed';
  digestFrequency: DigestFrequency;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  webappEnabled: boolean;
  lastDigestSentAt: string | null;
}

export type NotificationType = 'digest' | 'nudge' | 'artifact' | 'milestone';

export interface Notification {
  id: string;
  companyId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string | null;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

export type ArtifactType = 'report' | 'code' | 'strategy' | 'content' | 'analysis' | 'email_draft' | 'other';

export interface Artifact {
  id: string;
  companyId: string;
  cycleId: string | null;
  taskId: string | null;
  agentRole: AgentRole;
  agentName: string;
  title: string;
  type: ArtifactType;
  content: string;
  preview: string;
  createdAt: string;
}

// ============================================================
// SEO + Ads Types (Scale tier)
// ============================================================

export type SEOAuditType = 'technical' | 'on_page' | 'keywords';

export interface SEOAudit {
  id: string;
  companyId: string;
  cycleId: string | null;
  url: string;
  auditType: SEOAuditType;
  results: Record<string, unknown>;
  score: number | null;
  createdAt: string;
}

export type AdPlatform = 'google' | 'meta' | 'tiktok' | 'linkedin';

export interface AdPlatformCredential {
  id: string;
  companyId: string;
  platform: AdPlatform;
  accountId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BudgetChange {
  id: string;
  companyId: string;
  platform: string;
  campaignId: string;
  previousBudget: number;
  newBudget: number;
  changePercent: number;
  autoApproved: boolean;
  approvedBy: string | null;
  reason: string | null;
  createdAt: string;
}

// ============================================================
// Reflection Agent Types
// ============================================================

export type ReflectionPeriod = 'daily' | 'weekly';
export type RecommendationCriticality = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationCategory = 'revenue' | 'growth' | 'operations' | 'competitive' | 'retention';

export interface ReflectionKPIChange {
  metric: string;
  from: number | string;
  to: number | string;
  change: string;
  isPositive: boolean;
}

export interface ReflectionSummary {
  kpiChanges: ReflectionKPIChange[];
  topWin: string;
  topConcern: string;
}

export interface ReflectionSuggestedAction {
  description: string;
  agentRole: AgentRole;
  directive: string;
  estimatedImpact: string;
}

export interface ReflectionRecommendation {
  id: string;
  criticality: RecommendationCriticality;
  category: RecommendationCategory;
  title: string;
  reasoning: string;
  suggestedAction: ReflectionSuggestedAction;
  triggerEnabled: boolean;
}

export interface ReflectionOutput {
  id: string;
  companyId: string;
  period: ReflectionPeriod;
  summary: ReflectionSummary;
  recommendations: ReflectionRecommendation[];
  overallHealthScore: number;
  createdAt: string;
}

export type TriggerStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TriggerSource = 'slack' | 'email' | 'voice' | 'webapp' | 'sms';

export interface ReflectionTrigger {
  id: string;
  reflectionId: string;
  recommendationId: string;
  triggeredAt: string;
  triggeredVia: TriggerSource;
  cycleId: string | null;
  status: TriggerStatus;
}

// ============================================================
// Agent Reflection & Alignment System Types
// ============================================================

// --- Reasoning Audit Types ---
export interface ReasoningAudit {
  id: string;
  taskId: string;
  cycleId: string;
  companyId: string;
  agentRole: AgentRole;

  // What was decided
  decisionSummary: string;

  // Reasoning trace
  rationale: string[];

  // Assumptions made
  assumptions: string[];

  // Alternatives considered
  alternativesConsidered: { option: string; whyRejected: string }[];

  // Identified risks
  risksIdentified: string[];

  // Confidence level (0-100)
  confidenceScore: number;

  // What would change the decision
  invalidationTriggers: string[];

  createdAt: string;
}

// --- Alignment System Types ---
export interface AgentGoal {
  id: string;
  cycleId: string;
  companyId: string;
  agentRole: AgentRole;

  // What the agent is optimizing for
  goal: string;

  // Metrics being tracked
  metrics: string[];

  // Planned actions
  plannedActions: string[];

  // Resources needed
  resourcesNeeded: string[];

  createdAt: string;
}

export type ConflictType = 'resource' | 'goal' | 'priority' | 'timing';
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AlignmentConflict {
  id: string;
  cycleId: string;
  companyId: string;
  agents: [AgentRole, AgentRole];
  conflictType: ConflictType;
  description: string;
  severity: ConflictSeverity;
  resolution: string | null;
  resolvedBy: 'atlas' | 'human' | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AlignmentReport {
  cycleId: string;
  companyId: string;
  overallScore: number; // 0-100

  // Per-agent alignment with CEO priorities
  agentAlignment: { agent: AgentRole; alignmentScore: number }[];

  // Active conflicts
  conflicts: AlignmentConflict[];

  // Recommendations
  suggestions: string[];

  createdAt: string;
}

// --- Cycle Summary Types ---
export interface CycleSummary {
  id: string;
  cycleId: string;
  companyId: string;
  cycleNumber: number;
  duration: { planned: number; actual: number };

  // One-liner
  headline: string;

  // What got done
  completed: {
    agent: AgentRole;
    task: string;
    outcome: 'success' | 'partial' | 'blocked';
    highlight?: string;
  }[];

  // What's in progress
  inProgress: { agent: AgentRole; task: string; blockedBy?: string }[];

  // Metrics impact
  metricsImpact: { metric: string; before: number; after: number; delta: string }[];

  // Alignment score
  alignmentScore: number;

  // CEO's take
  ceoComment: string;

  // Next priority
  nextPriority: string;

  createdAt: string;
}

// --- Weekly Reflection Summary Types ---
export type AgentTrend = 'up' | 'down' | 'stable';

export interface WeeklyReflectionSummary {
  id: string;
  companyId: string;
  weekOf: string;
  cyclesCompleted: number;

  // Top wins
  wins: { what: string; impact: string; agent: AgentRole }[];

  // Top concerns
  concerns: { what: string; risk: string; owner: AgentRole }[];

  // Agent rankings
  agentRankings: { agent: AgentRole; score: number; trend: AgentTrend }[];

  // Lessons learned
  lessonsLearned: { lesson: string; evidence: string; agentRole: AgentRole }[];

  // Alignment trend
  alignmentTrend: { score: number; previousScore: number; conflicts: number };

  // CEO assessment
  ceoAssessment: {
    whatWorked: string;
    whatDidnt: string;
    focusNextWeek: string;
    riskToWatch: string;
  };

  // Human action items
  humanActions: { action: string; urgency: 'now' | 'soon' | 'later'; context: string }[];

  createdAt: string;
}

// --- Agent Learning Types ---
export type LessonStatus = 'proposed' | 'validating' | 'active' | 'deprecated';

export interface AgentLesson {
  id: string;
  companyId: string;
  agentRole: AgentRole;

  // What was learned
  lesson: string;

  // Evidence from cycles
  evidence: { cycleId: string; outcome: string; relevance: string }[];

  // Status progression
  status: LessonStatus;

  // Prompt addition when active
  promptAddition: string;

  // Performance impact if active
  impactMetrics?: { before: number; after: number };

  // Validation cycles required (increases with maturity)
  requiredCycles: number;

  // Cycles validated so far
  validationCycles: number;

  createdAt: string;
  updatedAt: string;
}

// --- User Journey Review Types ---
export type JourneyStage = 'awareness' | 'consideration' | 'purchase' | 'onboarding' | 'usage' | 'retention';
export type JourneyHealth = 'healthy' | 'needs-attention' | 'critical';

export interface UserJourneyReview {
  id: string;
  companyId: string;
  reviewDate: string;

  // Per-agent reflections on their touchpoints
  agentReflections: {
    agent: AgentRole;
    touchpoints: string[];
    frictionPoints: string[];
    improvements: string[];
  }[];

  // Synthesized journey map
  journeyStages: {
    stage: JourneyStage;
    health: JourneyHealth;
    ownerAgents: AgentRole[];
    issues: string[];
    actions: string[];
  }[];

  // Overall score
  experienceScore: number;

  createdAt: string;
}

// --- Task Significance Config ---
export interface TaskSignificanceConfig {
  minPriority: number; // Tasks with priority <= this get audits
  minCostUsd: number; // Tasks costing more than this get audits
  strategicKeywords: string[]; // Keywords that trigger audits
}

// ============================================================
// Team Task Types (4-Agent Parallel Execution)
// ============================================================

/** Supported merge strategies for team task results */
export type TeamMergeStrategy = 'concatenate' | 'synthesize' | 'vote';

/** Team task status progression */
export type TeamTaskStatus = 'pending' | 'running' | 'merging' | 'completed' | 'failed';

/**
 * Configuration for a team task execution.
 */
export interface TeamTaskConfig {
  /** Task description/directive */
  description: string;

  /** Agent roles to include (2-4 agents) */
  agents: AgentRole[];

  /** Strategy for merging agent outputs */
  mergeStrategy: TeamMergeStrategy;
}

/**
 * Result of a team task execution.
 */
export interface TeamTaskResult {
  /** Unique team task ID */
  teamTaskId: string;

  /** Final status */
  status: 'completed' | 'failed';

  /** Error message if failed */
  error?: string;

  /** Individual agent results */
  agentResults: {
    role: AgentRole;
    status: 'success' | 'failed';
    result: string;
    error?: string;
  }[];

  /** Merged result from all successful agents */
  mergedResult: string | null;

  /** Total credits consumed */
  creditsUsed: number;
}

/**
 * Team task record as stored in database.
 */
export interface TeamTask {
  id: string;
  cycleId: string;
  companyId: string;
  description: string;
  agentRoles: AgentRole[];
  status: TeamTaskStatus;
  creditsReserved: number;
  mergedResult: string | null;
  mergeStrategy: TeamMergeStrategy;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Note: Team task event types are now integrated directly into CycleStreamEvent

// ============================================================
// Advanced Cognitive Memory Types
// ============================================================

// --- Memory Association Types ---
export type MemoryAssociationType =
  | 'supports'      // A supports/confirms B
  | 'contradicts'   // A contradicts B (trigger resolution)
  | 'elaborates'    // A adds detail to B
  | 'derives_from'  // A was inferred from B
  | 'related_to';   // General semantic relation

export interface MemoryAssociation {
  id: string;
  companyId: string;
  memoryAId: string;
  memoryBId: string;
  relationshipType: MemoryAssociationType;
  strength: number; // 0-1
  createdAt: string;
  createdBy: string | null; // 'system' | 'user' | agent role
}

// --- Memory Usage Tracking ---
export interface MemoryUsageLog {
  id: string;
  memoryId: string;
  companyId: string;
  cycleId: string | null;
  usedByAgent: AgentRole;
  taskContext: string | null;
  wasHelpful: boolean | null;
  relevanceScore: number | null;
  createdAt: string;
}

// --- Memory Recall Configuration (Per-Company Adaptive Weights) ---
export interface MemoryRecallConfig {
  id: string;
  companyId: string;
  // Base weights (must sum to ~1.0)
  weightSemantic: number;
  weightImportance: number;
  weightConfidence: number;
  weightRecency: number;
  weightFrequency: number;
  // Domain-specific boosts
  domainBoosts: Record<MemoryDomain, number>;
  // Agent-domain affinities learned over time
  agentDomainAffinities: Record<AgentRole, Record<MemoryDomain, number>>;
  // Decay adjustments by domain (in days)
  domainHalfLifeOverrides: Partial<Record<MemoryDomain, number>>;
  // Version tracking
  version: number;
  updatedAt: string;
}

// --- Memory Lessons (Strategy Learnings) ---
export type MemoryLessonStatus = 'proposed' | 'validating' | 'active' | 'deprecated';
export type MemoryStrategyType = 'weight_adjustment' | 'decay_adjustment' | 'attention_bias' | 'domain_priority';

export interface MemoryLesson {
  id: string;
  companyId: string;
  lesson: string;
  evidence: { period: string; metric: string; value: number }[];
  strategyType: MemoryStrategyType;
  strategyBefore: Record<string, unknown>;
  strategyAfter: Record<string, unknown>;
  status: MemoryLessonStatus;
  validationCycles: number;
  requiredCycles: number;
  performanceBefore: number | null;
  performanceAfter: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- Memory Reflection Output ---
export interface MemoryReflectionOutput {
  id: string;
  companyId: string;
  period: 'daily' | 'weekly';
  metrics: {
    totalRecalls: number;
    helpfulRecalls: number;
    unhelpfulRecalls: number;
    recallAccuracy: number;
    avgRelevanceScore: number;
    byDomain: Record<MemoryDomain, {
      recalls: number;
      accuracy: number;
      topPerformingMemories: string[];
      underperformingMemories: string[];
    }>;
    byAgent: Record<AgentRole, {
      recalls: number;
      mostUsedDomains: MemoryDomain[];
      avgRelevance: number;
    }>;
  };
  insights: string[];
  recommendations: MemoryRecommendation[];
  suggestedWeightChanges: {
    currentWeights: Partial<MemoryRecallConfig>;
    suggestedWeights: Partial<MemoryRecallConfig>;
    rationale: string;
  } | null;
  overallHealthScore: number;
  createdAt: string;
}

export interface MemoryRecommendation {
  id: string;
  type: 'boost' | 'archive' | 'consolidate' | 'decay_adjust' | 'weight_change';
  memoryIds?: string[];
  description: string;
  impact: 'high' | 'medium' | 'low';
  autoApply: boolean;
}

// --- Contradiction Detection ---
export type ContradictionType = 'factual' | 'temporal' | 'strategic';
export type ContradictionResolution = 'keep_newer' | 'keep_more_important' | 'merge' | 'ask_user';

export interface Contradiction {
  id: string;
  companyId: string;
  memoryA: CompanyMemory;
  memoryB: CompanyMemory;
  conflictType: ContradictionType;
  suggestedResolution: ContradictionResolution;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: 'system' | 'user' | null;
  createdAt: string;
}

// --- Attention Mechanism Context ---
export interface AttentionContext {
  task: string;
  agentRole: AgentRole;
  recentActivities: string[];
  tokenBudget?: number;
}

// --- Semantic Recall Options ---
export interface SemanticRecallOptions extends MemoryRecallOptions {
  queryEmbedding?: number[];
  semanticThreshold?: number;
  useSemanticSearch?: boolean;
}

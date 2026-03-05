/**
 * TypeScript interfaces for "The Breath" landing page activity visualization.
 * These types define the data structures for real-time platform metrics streaming.
 */

/**
 * Aggregate platform metrics displayed in "The Breath" visualization.
 * companiesRunning is the center stat, others orbit around it.
 */
export interface PlatformMetrics {
  /** Number of companies actively running on the platform (center stat) */
  companiesRunning: number;
  /** Total hours saved by AI agents across all companies (orbiting stat) */
  hoursSaved: number;
  /** Number of AI-driven decisions made today (orbiting stat) */
  decisionsToday: number;
  /** Number of agents currently active across the platform (orbiting stat) */
  activeAgents: number;
  /** Number of cross-team handoffs completed (orbiting stat) */
  crossTeamHandoffs: number;
  /** Platform-wide alignment score percentage 0-100 (orbiting stat) */
  alignmentScore: number;
}

/**
 * Individual agent activity event for the activity feed.
 * Used to show real-time agent completions from across the platform.
 */
export interface ActivityEvent {
  /** Unique identifier for the activity */
  id: string;
  /** Name of the agent (e.g., "Atlas", "Forge", "Echo") */
  agentName: string;
  /** Anonymized company name (e.g., "TechCorp", "GrowthLabs") */
  companyName: string;
  /** Description of the action (e.g., "completed market analysis", "shipped feature") */
  action: string;
  /** When the activity occurred */
  timestamp: Date;
}

/**
 * Platform evolution event showing system self-improvement.
 * These are rare events (2-3x per day) that show the platform evolving.
 */
export interface EvolutionEvent {
  /** Unique identifier for the evolution event */
  id: string;
  /** Description of the improvement (e.g., "System improved response accuracy by 3%") */
  description: string;
  /** When the evolution occurred */
  timestamp: Date;
}

/**
 * Union type for SSE stream events.
 * The 'type' field discriminates between different event types.
 */
export interface ActivityStreamEvent {
  /** Event type discriminator */
  type: 'metrics' | 'activity' | 'evolution' | 'connected' | 'keepalive';
  /** Event payload - type depends on the 'type' field */
  data?: PlatformMetrics | ActivityEvent | EvolutionEvent;
}

/**
 * Type guard to check if data is PlatformMetrics
 */
export function isPlatformMetrics(data: unknown): data is PlatformMetrics {
  return (
    typeof data === 'object' &&
    data !== null &&
    'companiesRunning' in data &&
    'hoursSaved' in data &&
    'decisionsToday' in data
  );
}

/**
 * Type guard to check if data is ActivityEvent
 */
export function isActivityEvent(data: unknown): data is ActivityEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'agentName' in data &&
    'companyName' in data &&
    'action' in data
  );
}

/**
 * Type guard to check if data is EvolutionEvent
 */
export function isEvolutionEvent(data: unknown): data is EvolutionEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'description' in data &&
    !('agentName' in data)
  );
}

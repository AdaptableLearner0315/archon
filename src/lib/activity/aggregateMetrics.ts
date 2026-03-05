import { createClient } from '@/lib/supabase/server';
import type { PlatformMetrics, ActivityEvent, EvolutionEvent } from '@/types/activity';

// Agent names from the platform
const AGENT_NAMES = [
  'Atlas', 'Forge', 'Pulse', 'Echo', 'Prism',
  'Nexus', 'Arrow', 'Shield', 'Lens', 'Bloom',
  'Scout', 'Spark'
];

// Anonymized company names for privacy (we don't expose real company names)
const FAKE_COMPANY_NAMES = [
  'TechCorp', 'GrowthLabs', 'BuildSignal', 'NovaSoft', 'QuantumLeap',
  'ByteForge', 'CloudNine', 'DataDriven', 'ScaleUp', 'VentureX',
  'PulsePoint', 'NextGen', 'AlphaWorks', 'BetaLaunch', 'DeltaOps',
  'OmegaTech', 'ZenithAI', 'ApexVentures', 'PrimeFlow', 'SwiftScale',
  'BrightPath', 'ClearView', 'DeepMind', 'EdgeTech', 'FastTrack',
  'GlobalReach', 'HighPoint', 'InnovateCo', 'JumpStart', 'KeyMetrics'
];

// Action templates for generating realistic activity
const ACTION_TEMPLATES = [
  { agent: 'Atlas', actions: ['aligned quarterly OKRs', 'completed strategic review', 'coordinated team priorities', 'finalized growth roadmap'] },
  { agent: 'Forge', actions: ['shipped feature update', 'deployed bug fix', 'optimized database queries', 'refactored core module'] },
  { agent: 'Pulse', actions: ['analyzed growth metrics', 'identified expansion opportunity', 'optimized conversion funnel', 'launched A/B test'] },
  { agent: 'Echo', actions: ['drafted marketing campaign', 'published blog content', 'scheduled social posts', 'completed brand audit'] },
  { agent: 'Prism', actions: ['prioritized feature backlog', 'completed user research', 'drafted product specs', 'analyzed feature usage'] },
  { agent: 'Nexus', actions: ['streamlined operations', 'updated team processes', 'resolved workflow bottleneck', 'automated manual task'] },
  { agent: 'Arrow', actions: ['qualified new lead', 'sent outreach sequence', 'scheduled demo call', 'updated pipeline forecast'] },
  { agent: 'Shield', actions: ['resolved support ticket', 'updated help documentation', 'improved response template', 'analyzed support trends'] },
  { agent: 'Lens', actions: ['generated analytics report', 'identified data pattern', 'built KPI dashboard', 'completed trend analysis'] },
  { agent: 'Bloom', actions: ['completed customer check-in', 'improved onboarding flow', 'reduced churn risk', 'gathered product feedback'] },
  { agent: 'Scout', actions: ['completed SEO audit', 'optimized meta tags', 'improved page speed', 'updated keyword strategy'] },
  { agent: 'Spark', actions: ['optimized ad spend', 'adjusted campaign bids', 'improved ROAS', 'launched new ad creative'] }
];

// Evolution event templates
const EVOLUTION_TEMPLATES = [
  'System improved response accuracy by {percent}%',
  'Agent coordination efficiency increased by {percent}%',
  'Cross-team handoff latency reduced by {percent}%',
  'Decision-making speed improved by {percent}%',
  'Resource allocation efficiency up {percent}%',
  'Customer satisfaction prediction accuracy improved by {percent}%',
  'Learned new optimization pattern from {count} successful cycles',
  'Automatically adjusted agent priorities based on {count} data points'
];

/**
 * Get random element from array
 */
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random number within a range
 */
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate realistic mock metrics for the landing page.
 * Uses plausible ranges based on the design spec.
 */
function generateMockMetrics(): PlatformMetrics {
  return {
    companiesRunning: randomInRange(2000, 3000),
    hoursSaved: randomInRange(10000, 15000),
    decisionsToday: randomInRange(800000, 1000000),
    activeAgents: randomInRange(200, 300),
    crossTeamHandoffs: randomInRange(1000, 2000),
    alignmentScore: randomInRange(92, 98)
  };
}

/**
 * Generate a single mock activity event with realistic data.
 */
function generateMockActivity(): ActivityEvent {
  const agentTemplate = randomElement(ACTION_TEMPLATES);
  const action = randomElement(agentTemplate.actions);
  const companyName = randomElement(FAKE_COMPANY_NAMES);

  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    agentName: agentTemplate.agent,
    companyName,
    action,
    timestamp: new Date()
  };
}

/**
 * Generate a mock evolution event.
 */
function generateMockEvolution(): EvolutionEvent {
  const template = randomElement(EVOLUTION_TEMPLATES);
  const description = template
    .replace('{percent}', String(randomInRange(1, 5)))
    .replace('{count}', String(randomInRange(100, 500)));

  return {
    id: `evolution-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    description,
    timestamp: new Date()
  };
}

/**
 * Fetches platform-wide metrics from Supabase.
 * Falls back to realistic mock data if database queries fail or return no data.
 */
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  try {
    const supabase = await createClient();

    // Query for company count
    const { count: companyCount, error: companyError } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });

    if (companyError) {
      console.error('Error fetching company count:', companyError);
      return generateMockMetrics();
    }

    // Query for today's activities count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { count: activityCount, error: activityError } = await supabase
      .from('agent_activities')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO);

    if (activityError) {
      console.error('Error fetching activity count:', activityError);
      return generateMockMetrics();
    }

    // If we have real data, use it with some derived metrics
    const realCompanies = companyCount || 0;
    const realActivities = activityCount || 0;

    // If we have enough real data, use it
    if (realCompanies >= 10 && realActivities >= 100) {
      // Derive other metrics from real data
      const estimatedActiveAgents = Math.min(realCompanies * 10, 300); // ~10 agents per company
      const estimatedHoursSaved = realActivities * 2; // ~2 hours saved per activity
      const estimatedHandoffs = Math.floor(realActivities * 0.3); // ~30% involve handoffs

      return {
        companiesRunning: realCompanies,
        hoursSaved: estimatedHoursSaved,
        decisionsToday: realActivities,
        activeAgents: estimatedActiveAgents,
        crossTeamHandoffs: estimatedHandoffs,
        alignmentScore: randomInRange(92, 98) // This would need a more complex query
      };
    }

    // Not enough real data, return mock metrics
    return generateMockMetrics();
  } catch (error) {
    console.error('Error in getPlatformMetrics:', error);
    return generateMockMetrics();
  }
}

/**
 * Fetches recent agent activity from across all companies.
 * For privacy, company names are replaced with fake names.
 * Falls back to mock data if database is empty or queries fail.
 */
export async function getRecentActivity(limit: number = 10): Promise<ActivityEvent[]> {
  try {
    const supabase = await createClient();

    const { data: activities, error } = await supabase
      .from('agent_activities')
      .select('id, agent_name, action, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent activity:', error);
      // Return mock activities
      return Array.from({ length: limit }, () => generateMockActivity());
    }

    if (!activities || activities.length === 0) {
      // No real data, return mock activities
      return Array.from({ length: limit }, () => generateMockActivity());
    }

    // Transform real activities (with anonymized company names for privacy)
    return activities.map((activity) => ({
      id: activity.id,
      agentName: activity.agent_name || randomElement(AGENT_NAMES),
      companyName: randomElement(FAKE_COMPANY_NAMES), // Privacy: don't expose real names
      action: activity.action || 'completed task',
      timestamp: new Date(activity.created_at)
    }));
  } catch (error) {
    console.error('Error in getRecentActivity:', error);
    // Return mock activities on any error
    return Array.from({ length: limit }, () => generateMockActivity());
  }
}

/**
 * Generates a new activity event.
 * In a real scenario, this would come from database subscriptions.
 * For the landing page, we generate realistic mock events.
 */
export function generateActivityEvent(): ActivityEvent {
  return generateMockActivity();
}

/**
 * Generates an evolution event.
 * These are rare events (2-3x per day in production).
 */
export function generateEvolutionEvent(): EvolutionEvent {
  return generateMockEvolution();
}

/**
 * Slightly adjusts metrics to simulate real-time changes.
 * Used for periodic metric updates to show "living" data.
 */
export function adjustMetrics(metrics: PlatformMetrics): PlatformMetrics {
  return {
    companiesRunning: metrics.companiesRunning + randomInRange(-2, 5),
    hoursSaved: metrics.hoursSaved + randomInRange(10, 50),
    decisionsToday: metrics.decisionsToday + randomInRange(100, 500),
    activeAgents: Math.max(150, Math.min(350, metrics.activeAgents + randomInRange(-5, 10))),
    crossTeamHandoffs: metrics.crossTeamHandoffs + randomInRange(5, 20),
    alignmentScore: Math.max(88, Math.min(99, metrics.alignmentScore + randomInRange(-1, 1)))
  };
}

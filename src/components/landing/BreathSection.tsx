'use client';

import { useState, useMemo } from 'react';
import TheBreath from './TheBreath';
import ActivitySection from './ActivitySection';
import ActivityToggle from './ActivityToggle';
import { useActivityStream } from '@/hooks/useActivityStream';
import { sampleTickerItems, type TickerItem } from './ActivityTicker';
import { type ActivityItemData } from './ActivityItem';
import { type CategorizedActivities } from './ActivityDashboard';
import { type MetricData } from './MetricsBar';

/**
 * Agent to category mapping for the multi-column activity dashboard.
 */
const AGENT_CATEGORIES: Record<string, keyof CategorizedActivities> = {
  'Forge': 'engineering',
  'Echo': 'marketing',
  'Pulse': 'marketing',
  'Arrow': 'sales',
  'Bloom': 'sales',
  'Atlas': 'operations',
  'Nexus': 'operations',
  'Shield': 'operations',
  'Prism': 'operations',
  'Lens': 'operations',
};

/**
 * Sample activities for each category when no live data is available.
 */
const sampleCategorizedActivities: CategorizedActivities = {
  engineering: [
    { id: 'eng-1', agent: 'Forge', company: 'TechCorp', action: 'Shipped v2.1 release', timestamp: new Date(Date.now() - 2 * 60000) },
    { id: 'eng-2', agent: 'Forge', company: 'AppBuilder', action: 'Fixed auth bug', timestamp: new Date(Date.now() - 4 * 60000) },
    { id: 'eng-3', agent: 'Forge', company: 'DevStudio', action: 'Code review completed', timestamp: new Date(Date.now() - 8 * 60000) },
  ],
  marketing: [
    { id: 'mkt-1', agent: 'Echo', company: 'MediaCorp', action: 'Posted blog article', timestamp: new Date(Date.now() - 5 * 60000) },
    { id: 'mkt-2', agent: 'Pulse', company: 'GrowthCo', action: 'A/B test launched', timestamp: new Date(Date.now() - 12 * 60000) },
    { id: 'mkt-3', agent: 'Echo', company: 'BrandFirst', action: 'Social campaign live', timestamp: new Date(Date.now() - 18 * 60000) },
  ],
  sales: [
    { id: 'sales-1', agent: 'Arrow', company: 'SaleForce', action: 'Closed enterprise deal', timestamp: new Date(Date.now() - 8 * 60000) },
    { id: 'sales-2', agent: 'Bloom', company: 'CustomerFirst', action: 'Onboarding completed', timestamp: new Date(Date.now() - 15 * 60000) },
    { id: 'sales-3', agent: 'Arrow', company: 'LeadGen', action: 'Qualified 12 leads', timestamp: new Date(Date.now() - 22 * 60000) },
  ],
  operations: [
    { id: 'ops-1', agent: 'Atlas', company: 'BuildCorp', action: 'Set Q2 KPIs', timestamp: new Date(Date.now() - 1 * 60000) },
    { id: 'ops-2', agent: 'Nexus', company: 'OpsFlow', action: 'Automated workflow', timestamp: new Date(Date.now() - 3 * 60000) },
    { id: 'ops-3', agent: 'Lens', company: 'DataDriven', action: 'Trend analysis ready', timestamp: new Date(Date.now() - 7 * 60000) },
    { id: 'ops-4', agent: 'Shield', company: 'SupportHub', action: 'Resolved 8 tickets', timestamp: new Date(Date.now() - 10 * 60000) },
  ],
};

/**
 * BreathSection - The main activity visualization section for the landing page.
 * Integrates TheBreath, ActivityToggle, and ActivitySection with real-time data.
 */
export default function BreathSection() {
  const [mode, setMode] = useState<'activity' | 'functionality'>('activity');
  const { metrics, recentActivity, lastEvolution, connected } = useActivityStream();

  // Convert metrics to format expected by TheBreath
  const centerStat = useMemo(() => ({
    value: metrics?.companiesRunning ?? 2847,
    label: 'Companies running',
  }), [metrics?.companiesRunning]);

  const orbitingStats = useMemo(() => [
    {
      value: metrics ? `${(metrics.hoursSaved / 1000).toFixed(1)}K` : '12.8K',
      label: 'hours saved',
    },
    {
      value: metrics ? `${(metrics.decisionsToday / 1000).toFixed(0)}K` : '847K',
      label: 'decisions',
    },
    {
      value: metrics?.activeAgents?.toString() ?? '234',
      label: 'agents active',
    },
    {
      value: metrics ? `${(metrics.crossTeamHandoffs / 1000).toFixed(1)}K` : '1.2K',
      label: 'handoffs',
    },
    {
      value: metrics ? `${metrics.alignmentScore.toFixed(1)}%` : '94.7%',
      label: 'aligned',
    },
  ], [metrics]);

  // Convert metrics to MetricsBar format with growth indicators
  const metricsBarData: MetricData[] = useMemo(() => [
    {
      label: 'Companies',
      value: metrics?.companiesRunning ?? 2847,
      change: 12,
    },
    {
      label: 'Hours Saved',
      value: metrics ? `${(metrics.hoursSaved / 1000).toFixed(1)}K` : '12.8K',
      change: 8,
    },
    {
      label: 'Decisions',
      value: metrics ? `${(metrics.decisionsToday / 1000).toFixed(0)}K` : '847K',
      change: 15,
    },
    {
      label: 'Agents',
      value: metrics?.activeAgents ?? 234,
      change: 3,
    },
  ], [metrics]);

  // Categorize recent activity for the multi-column dashboard
  const categorizedActivities: CategorizedActivities = useMemo(() => {
    if (recentActivity.length === 0) {
      return sampleCategorizedActivities;
    }

    const categorized: CategorizedActivities = {
      engineering: [],
      marketing: [],
      sales: [],
      operations: [],
    };

    recentActivity.forEach((event) => {
      const category = AGENT_CATEGORIES[event.agentName] ?? 'operations';
      const item: ActivityItemData = {
        id: event.id,
        agent: event.agentName,
        company: event.companyName,
        action: event.action,
        timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp),
      };
      categorized[category].push(item);
    });

    // Ensure each category has some items (fall back to samples if empty)
    (Object.keys(categorized) as (keyof CategorizedActivities)[]).forEach((key) => {
      if (categorized[key].length === 0) {
        categorized[key] = sampleCategorizedActivities[key];
      }
    });

    return categorized;
  }, [recentActivity]);

  // Convert recent activity to ticker items (kept for backward compatibility)
  const tickerItems: TickerItem[] = useMemo(() => {
    if (recentActivity.length > 0) {
      return recentActivity.slice(0, 10).map((event) => ({
        agent: event.agentName,
        company: event.companyName,
        action: event.action,
      }));
    }
    // Fall back to sample items while loading
    return sampleTickerItems;
  }, [recentActivity]);

  // Calculate breathing speed based on activity (more activity = faster breathing)
  const breathingSpeed = useMemo(() => {
    if (!metrics) return 4000; // Default 4 seconds
    // Scale between 3s (very active) and 5s (less active)
    const activityLevel = Math.min(metrics.activeAgents / 300, 1);
    return 5000 - activityLevel * 2000;
  }, [metrics?.activeAgents]);

  // Handle evolution events
  const handleEvolution = () => {
    // Could trigger a visual effect or notification here
    console.log('System evolved:', lastEvolution);
  };

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
            The pulse of autonomous organizations
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Real-time activity from {centerStat.value.toLocaleString()} companies running on Archon
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-8">
          <ActivityToggle mode={mode} onModeChange={setMode} />
        </div>

        {/* Connection indicator (subtle) */}
        {!connected && (
          <div className="text-center mb-4">
            <span className="text-xs text-white/30">
              Connecting to live data...
            </span>
          </div>
        )}

        {/* Main visualization */}
        <ActivitySection
          mode={mode}
          tickerItems={tickerItems}
          metricsBarData={metricsBarData}
          categorizedActivities={categorizedActivities}
        >
          <TheBreath
            centerStat={centerStat}
            orbitingStats={orbitingStats}
            breathingSpeed={breathingSpeed}
            onEvolution={handleEvolution}
            className="max-w-2xl mx-auto"
          />
        </ActivitySection>

        {/* Evolution indicator */}
        {lastEvolution && (
          <div className="text-center mt-6 animate-pulse">
            <span className="text-xs text-white/60">
              System evolved: {lastEvolution.description}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

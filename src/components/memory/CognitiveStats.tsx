'use client';

import type { MemoryDomain } from '@/lib/types';
import { Brain, Archive, Clock, Sparkles } from 'lucide-react';

interface CognitiveStatsProps {
  stats: {
    total: number;
    active: number;
    archived: number;
    byDomain: Record<MemoryDomain, number>;
    lastUpdated: string | null;
  };
}

export function CognitiveStats({ stats }: CognitiveStatsProps) {
  const healthScore = calculateHealthScore(stats);

  return (
    <div className="bg-black border border-white/6 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider">
          Cognitive Health
        </h2>
        <HealthBadge score={healthScore} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Brain className="w-5 h-5" />}
          label="Total Memories"
          value={stats.total}
          color="text-white"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Active"
          value={stats.active}
          color="text-green-400"
        />
        <StatCard
          icon={<Archive className="w-5 h-5" />}
          label="Archived"
          value={stats.archived}
          color="text-white/40"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Last Updated"
          value={stats.lastUpdated ? formatRelativeTime(stats.lastUpdated) : 'Never'}
          isText
          color="text-white/60"
        />
      </div>

      {/* Domain distribution bar */}
      <div className="mt-4 pt-4 border-t border-white/6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/40">Memory Distribution</span>
          <span className="text-xs text-white/40">{stats.active} active</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
          <DomainBar domain="business_context" count={stats.byDomain.business_context} total={stats.active} color="bg-blue-500" />
          <DomainBar domain="competitors" count={stats.byDomain.competitors} total={stats.active} color="bg-purple-500" />
          <DomainBar domain="market" count={stats.byDomain.market} total={stats.active} color="bg-amber-500" />
          <DomainBar domain="agents" count={stats.byDomain.agents} total={stats.active} color="bg-cyan-500" />
        </div>
        <div className="flex items-center gap-4 mt-2">
          <DomainLegend label="Business" color="bg-blue-500" count={stats.byDomain.business_context} />
          <DomainLegend label="Competitors" color="bg-purple-500" count={stats.byDomain.competitors} />
          <DomainLegend label="Market" color="bg-amber-500" count={stats.byDomain.market} />
          <DomainLegend label="Agents" color="bg-cyan-500" count={stats.byDomain.agents} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  isText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  isText?: boolean;
}) {
  return (
    <div className="text-center">
      <div className={`${color} mb-2 flex justify-center`}>{icon}</div>
      <div className={`text-2xl font-semibold ${isText ? 'text-sm' : ''} ${color}`}>
        {value}
      </div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
    </div>
  );
}

function HealthBadge({ score }: { score: number }) {
  const getLabel = () => {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Needs Attention';
  };

  const getColor = () => {
    if (score >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (score >= 0.6) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (score >= 0.4) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${getColor()}`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= Math.round(score * 5) ? 'bg-current' : 'bg-current/20'
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-medium">{getLabel()}</span>
    </div>
  );
}

function DomainBar({
  count,
  total,
  color,
}: {
  domain: string;
  count: number;
  total: number;
  color: string;
}) {
  if (total === 0 || count === 0) return null;
  const width = (count / total) * 100;

  return (
    <div
      className={`${color} h-full transition-all`}
      style={{ width: `${width}%` }}
      title={`${count} memories`}
    />
  );
}

function DomainLegend({
  label,
  color,
  count,
}: {
  label: string;
  color: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-white/50">
        {label} ({count})
      </span>
    </div>
  );
}

function calculateHealthScore(stats: CognitiveStatsProps['stats']): number {
  // Health based on:
  // - Having memories across all domains (diversity)
  // - Active vs archived ratio
  // - Recent activity

  let score = 0;

  // Domain diversity (up to 0.4)
  const domainsWithMemories = Object.values(stats.byDomain).filter((c) => c > 0).length;
  score += (domainsWithMemories / 4) * 0.4;

  // Active ratio (up to 0.3)
  if (stats.total > 0) {
    score += (stats.active / stats.total) * 0.3;
  }

  // Volume (up to 0.2) - having at least 10 memories is healthy
  score += Math.min(1, stats.active / 10) * 0.2;

  // Recency (up to 0.1)
  if (stats.lastUpdated) {
    const hoursSinceUpdate = (Date.now() - new Date(stats.lastUpdated).getTime()) / 3600000;
    if (hoursSinceUpdate < 24) {
      score += 0.1;
    } else if (hoursSinceUpdate < 168) {
      score += 0.05;
    }
  }

  return Math.min(1, score);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

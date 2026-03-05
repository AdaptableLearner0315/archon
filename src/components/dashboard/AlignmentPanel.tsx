'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Users, Target, Zap, Clock } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface AlignmentConflict {
  id: string;
  agents: [string, string];
  conflictType: string;
  description: string;
  severity: string;
  resolution: string | null;
  resolvedAt: string | null;
}

interface AlignmentData {
  overallScore: number;
  agentAlignment: { agent: string; alignmentScore: number }[];
  conflicts: AlignmentConflict[];
  suggestions: string[];
}

const AGENT_NAMES: Record<string, string> = {
  ceo: 'Atlas',
  engineer: 'Forge',
  growth: 'Pulse',
  marketing: 'Echo',
  product: 'Prism',
  operations: 'Nexus',
  sales: 'Arrow',
  support: 'Shield',
  'data-analyst': 'Lens',
  'customer-success': 'Bloom',
  seo: 'Scout',
  ads: 'Spark',
};

const SEVERITY_COLORS = {
  low: 'text-muted-foreground',
  medium: 'text-warning',
  high: 'text-orange-500',
  critical: 'text-danger',
};

const CONFLICT_TYPE_ICONS = {
  resource: Users,
  goal: Target,
  priority: Zap,
  timing: Clock,
};

export default function AlignmentPanel() {
  const { companyId } = useAppStore();
  const [alignment, setAlignment] = useState<AlignmentData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAlignment = useCallback(async () => {
    if (!companyId) return;

    try {
      const res = await fetch(`/api/agents/alignment?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setAlignment(data);
      }
    } catch (error) {
      console.error('Failed to fetch alignment:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchAlignment();
    const interval = setInterval(fetchAlignment, 60000);
    return () => clearInterval(interval);
  }, [fetchAlignment]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary rounded w-1/3" />
          <div className="h-20 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!alignment) {
    return null;
  }

  const unresolvedConflicts = alignment.conflicts.filter((c) => !c.resolvedAt);
  const criticalCount = unresolvedConflicts.filter(
    (c) => c.severity === 'high' || c.severity === 'critical'
  ).length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Team Alignment
        </h2>
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              alignment.overallScore >= 80
                ? 'bg-success'
                : alignment.overallScore >= 60
                ? 'bg-warning'
                : 'bg-danger'
            }`}
          />
          <span className="text-lg font-bold">{alignment.overallScore}%</span>
        </div>
      </div>

      {/* Agent alignment bars */}
      <div className="space-y-2 mb-4">
        {alignment.agentAlignment.slice(0, 6).map((agent) => (
          <div key={agent.agent} className="flex items-center gap-2">
            <span className="text-xs w-16 truncate text-muted-foreground">
              {AGENT_NAMES[agent.agent] || agent.agent}
            </span>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  agent.alignmentScore >= 80
                    ? 'bg-success'
                    : agent.alignmentScore >= 60
                    ? 'bg-warning'
                    : 'bg-danger'
                }`}
                style={{ width: `${agent.alignmentScore}%` }}
              />
            </div>
            <span className="text-xs w-8 text-right font-mono">
              {agent.alignmentScore}
            </span>
          </div>
        ))}
      </div>

      {/* Conflicts section */}
      {unresolvedConflicts.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle
              className={`w-4 h-4 ${criticalCount > 0 ? 'text-danger' : 'text-warning'}`}
            />
            <span className="text-sm font-medium">
              {unresolvedConflicts.length} Active Conflict{unresolvedConflicts.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {unresolvedConflicts.slice(0, 3).map((conflict) => {
              const Icon = CONFLICT_TYPE_ICONS[conflict.conflictType as keyof typeof CONFLICT_TYPE_ICONS] || AlertTriangle;
              return (
                <div
                  key={conflict.id}
                  className="flex items-start gap-2 bg-secondary/30 p-2 rounded-lg"
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      SEVERITY_COLORS[conflict.severity as keyof typeof SEVERITY_COLORS]
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                      <span>{AGENT_NAMES[conflict.agents[0]] || conflict.agents[0]}</span>
                      <span className="text-primary">&harr;</span>
                      <span>{AGENT_NAMES[conflict.agents[1]] || conflict.agents[1]}</span>
                    </div>
                    <p className="text-sm line-clamp-2">{conflict.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resolved conflicts indicator */}
      {unresolvedConflicts.length === 0 && alignment.conflicts.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-success pt-2">
          <CheckCircle className="w-4 h-4" />
          <span>All conflicts resolved</span>
        </div>
      )}

      {/* Suggestions */}
      {alignment.suggestions.length > 0 && (
        <div className="border-t border-border pt-4 mt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Suggestions
          </h3>
          <ul className="space-y-1">
            {alignment.suggestions.slice(0, 2).map((suggestion, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary">&bull;</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface CycleSummaryProps {
  summary: {
    cycleNumber: number;
    headline: string;
    duration: { planned: number; actual: number };
    completed: { agent: string; task: string; outcome: string; highlight?: string }[];
    inProgress: { agent: string; task: string; blockedBy?: string }[];
    metricsImpact: { metric: string; before: number; after: number; delta: string }[];
    alignmentScore: number;
    ceoComment: string;
    nextPriority: string;
    createdAt: string;
  };
}

const AGENT_ICONS: Record<string, string> = {
  ceo: '\uD83C\uDFAF',
  engineer: '\u26A1',
  growth: '\uD83D\uDCC8',
  marketing: '\u270D\uFE0F',
  product: '\uD83D\uDC8E',
  operations: '\u2699\uFE0F',
  sales: '\uD83D\uDCE7',
  support: '\uD83D\uDEE1\uFE0F',
  'data-analyst': '\uD83D\uDCCA',
  'customer-success': '\uD83C\uDF31',
  seo: '\uD83D\uDD0D',
  ads: '\uD83D\uDCB0',
};

export default function CycleSummaryCard({ summary }: CycleSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const completedCount = summary.completed.filter((c) => c.outcome === 'success').length;
  const blockedCount = summary.completed.filter((c) => c.outcome === 'blocked').length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-secondary/30 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground">
                #{summary.cycleNumber}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(summary.createdAt)}
              </span>
            </div>
            <h3 className="text-sm font-medium leading-snug line-clamp-2">
              {summary.headline}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              <span>{completedCount}</span>
              {blockedCount > 0 && (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-warning ml-1" />
                  <span>{blockedCount}</span>
                </>
              )}
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{summary.duration.actual}m</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                summary.alignmentScore >= 80
                  ? 'bg-success'
                  : summary.alignmentScore >= 60
                  ? 'bg-warning'
                  : 'bg-danger'
              }`}
            />
            <span>Alignment: {summary.alignmentScore}%</span>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          {/* Completed tasks */}
          {summary.completed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Completed
              </h4>
              <div className="space-y-2">
                {summary.completed.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-sm ${
                      item.outcome === 'blocked' ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="flex-shrink-0">{AGENT_ICONS[item.agent] || '\u2022'}</span>
                    <div className="min-w-0">
                      <span className="line-clamp-1">{item.task}</span>
                      {item.highlight && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {item.highlight}
                        </p>
                      )}
                    </div>
                    {item.outcome === 'blocked' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* In progress tasks */}
          {summary.inProgress.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                In Progress
              </h4>
              <div className="space-y-2">
                {summary.inProgress.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex-shrink-0">{AGENT_ICONS[item.agent] || '\u2022'}</span>
                    <div className="min-w-0">
                      <span className="line-clamp-1">{item.task}</span>
                      {item.blockedBy && (
                        <p className="text-xs text-warning mt-0.5">Blocked: {item.blockedBy}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics impact */}
          {summary.metricsImpact.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Metrics Impact
              </h4>
              <div className="flex flex-wrap gap-2">
                {summary.metricsImpact.map((metric, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded text-xs"
                  >
                    {metric.delta.startsWith('+') ? (
                      <TrendingUp className="w-3 h-3 text-success" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-danger" />
                    )}
                    <span className="font-medium">{metric.metric}</span>
                    <span className="text-muted-foreground">{metric.delta}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CEO Comment */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span>{AGENT_ICONS.ceo}</span>
              <span className="text-xs font-semibold text-primary">Atlas (CEO)</span>
            </div>
            <p className="text-sm leading-relaxed">{summary.ceoComment}</p>
          </div>

          {/* Next priority */}
          <div className="flex items-start gap-2 text-sm">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Next:</span>
            <span>{summary.nextPriority}</span>
          </div>
        </div>
      )}
    </div>
  );
}

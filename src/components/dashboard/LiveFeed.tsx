'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Activity, LayoutList } from 'lucide-react';
import ArtifactCard from './ArtifactCard';
import CycleSummaryCard from './CycleSummaryCard';
import type { ArtifactType, CycleSummary } from '@/lib/types';

interface ArtifactData {
  id: string;
  title: string;
  type: ArtifactType;
  agent_name: string;
  preview: string;
  content: string;
  created_at: string;
}

export default function LiveFeed() {
  const { activities, companyId } = useAppStore();
  const [artifacts, setArtifacts] = useState<ArtifactData[]>([]);
  const [cycleSummaries, setCycleSummaries] = useState<CycleSummary[]>([]);
  const [showSummaries, setShowSummaries] = useState(false);

  const fetchArtifacts = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/artifacts?companyId=${companyId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
      }
    } catch {
      // Silently fail — artifacts are supplementary
    }
  }, [companyId]);

  const fetchSummaries = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/agents/cycle/summaries?companyId=${companyId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setCycleSummaries(data.summaries || []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  useEffect(() => {
    fetchArtifacts();
    fetchSummaries();
    const artifactInterval = setInterval(fetchArtifacts, 60_000);
    const summaryInterval = setInterval(fetchSummaries, 30_000);
    return () => {
      clearInterval(artifactInterval);
      clearInterval(summaryInterval);
    };
  }, [fetchArtifacts, fetchSummaries]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const typeColors: Record<string, string> = {
    action: 'border-l-primary',
    insight: 'border-l-warning',
    milestone: 'border-l-success',
    alert: 'border-l-danger',
    team: 'border-l-warning',
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Live Feed
        </h2>
        <div className="flex items-center gap-3">
          {cycleSummaries.length > 0 && (
            <button
              onClick={() => setShowSummaries(!showSummaries)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition ${
                showSummaries
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Summaries</span>
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </div>

      {/* Cycle Summaries */}
      {showSummaries && cycleSummaries.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Recent Cycle Summaries
          </p>
          {cycleSummaries.map((summary) => (
            <CycleSummaryCard key={summary.id} summary={summary} />
          ))}
        </div>
      )}

      {/* Recent artifacts */}
      {artifacts.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Recent Artifacts
          </p>
          {artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              title={artifact.title}
              type={artifact.type}
              agentName={artifact.agent_name}
              preview={artifact.preview}
              content={artifact.content}
              createdAt={artifact.created_at}
            />
          ))}
        </div>
      )}

      {/* Activity stream */}
      <div className="space-y-1 max-h-[440px] overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm">Agents are spinning up...</p>
            <p className="text-xs mt-1">Activity will appear here in real-time</p>
          </div>
        ) : (
          activities.map((activity) => {
            const isTeamActivity = activity.type === 'team' || activity.action.toLowerCase().includes('team');

            return (
              <div
                key={activity.id}
                className={`flex gap-3 py-2.5 px-3 rounded-lg border-l-2 ${
                  isTeamActivity ? 'border-l-warning bg-warning/5' : typeColors[activity.type]
                } hover:bg-secondary/30 transition fade-in`}
              >
                <span className="text-xs text-muted-foreground font-mono w-12 flex-shrink-0 pt-0.5">
                  {formatTime(activity.timestamp)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isTeamActivity && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold">
                        TEAM
                      </span>
                    )}
                    <span className="text-xs font-semibold text-primary">
                      {activity.agentName}
                    </span>
                    <span className="text-sm font-medium">{activity.action}</span>
                  </div>
                  {activity.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {activity.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

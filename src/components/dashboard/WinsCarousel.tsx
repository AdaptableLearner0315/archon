'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Sparkles, Clock } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { AGENTS } from '@/lib/types';
import type { AgentActivity, AgentRole } from '@/lib/types';

interface WinCardProps {
  activity: AgentActivity;
  isExpanded: boolean;
  onToggle: () => void;
}

function WinCard({ activity, isExpanded, onToggle }: WinCardProps) {
  const agentInfo = AGENTS.find(a => a.role === activity.agentRole);

  const timeAgo = useMemo(() => {
    const now = new Date();
    const then = new Date(activity.timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }, [activity.timestamp]);

  return (
    <button
      onClick={onToggle}
      className={`flex-shrink-0 w-64 bg-card border border-border rounded-xl p-4 text-left transition-all hover:border-primary/30 hover:shadow-lg ${
        isExpanded ? 'ring-2 ring-primary/30' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">{agentInfo?.icon || '🤖'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-success flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Win
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{activity.action}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {agentInfo?.name} ({agentInfo?.title})
          </p>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">{activity.detail}</p>
        </div>
      )}
    </button>
  );
}

interface WinsCarouselProps {
  maxItems?: number;
}

export default function WinsCarousel({ maxItems = 10 }: WinsCarouselProps) {
  const { activities } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter for milestones and significant actions
  const wins = useMemo(() => {
    return activities
      .filter(a => a.type === 'milestone' || a.type === 'insight')
      .slice(0, maxItems);
  }, [activities, maxItems]);

  // Mock wins if none exist
  const displayWins = useMemo(() => {
    if (wins.length > 0) return wins;

    // Return mock data for initial display
    return [
      {
        id: 'mock-1',
        agentRole: 'ceo' as AgentRole,
        agentName: 'Atlas',
        action: 'Initial analysis complete',
        detail: 'All agents have completed first-pass analysis. Strategy brief ready for review.',
        timestamp: new Date().toISOString(),
        type: 'milestone' as const,
      },
      {
        id: 'mock-2',
        agentRole: 'data-analyst' as AgentRole,
        agentName: 'Lens',
        action: 'Competitive scan finished',
        detail: 'Identified top 5 competitors and analyzed their pricing models.',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        type: 'milestone' as const,
      },
      {
        id: 'mock-3',
        agentRole: 'marketing' as AgentRole,
        agentName: 'Echo',
        action: 'Brand messaging drafted',
        detail: 'Created initial messaging framework and content calendar for Q1.',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        type: 'milestone' as const,
      },
    ];
  }, [wins]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 280;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (displayWins.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-success" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            This Week&apos;s Wins
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            className="p-1 rounded hover:bg-secondary transition"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1 rounded hover:bg-secondary transition"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory"
      >
        {displayWins.map((win) => (
          <div key={win.id} className="snap-start">
            <WinCard
              activity={win}
              isExpanded={expandedId === win.id}
              onToggle={() => setExpandedId(expandedId === win.id ? null : win.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

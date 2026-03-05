'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { AGENTS, type AgentActivity } from '@/lib/types';

interface NeuralStreamProps {
  className?: string;
}

// Get agent info by role
const getAgentInfo = (role: string) => {
  return AGENTS.find((a) => a.role === role) ?? { icon: '🤖', name: 'Agent' };
};

// Format timestamp to HH:MM:SS
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// Progress bar component
const ProgressBar = ({ progress }: { progress: number }) => {
  const filled = Math.floor(progress * 10);
  const partial = Math.floor((progress * 10 - filled) * 2);
  const empty = 10 - filled - (partial > 0 ? 1 : 0);

  return (
    <span className="text-white/50 font-mono text-[10px]">
      {'█'.repeat(filled)}
      {partial > 0 && '▓'}
      {'░'.repeat(empty)}
    </span>
  );
};

// Single activity entry component
const ActivityEntry = ({
  activity,
  isTyping,
  isWorking,
}: {
  activity: AgentActivity;
  isTyping: boolean;
  isWorking: boolean;
}) => {
  const agent = getAgentInfo(activity.agentRole);
  const [displayText, setDisplayText] = useState('');
  const fullText = activity.action;

  useEffect(() => {
    if (!isTyping) {
      setDisplayText(fullText);
      return;
    }

    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setDisplayText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 20);

    return () => clearInterval(interval);
  }, [isTyping, fullText]);

  return (
    <div className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/[0.02] transition-colors">
      <span className="text-muted-foreground/50 font-mono text-[10px] shrink-0 mt-0.5">
        ▸ {formatTime(activity.timestamp)}
      </span>
      <span className="text-sm shrink-0">{agent.icon}</span>
      <div className="flex-1 min-w-0">
        <span
          className={`text-xs font-medium ${
            isWorking ? 'text-white/90' : 'text-white/70'
          }`}
        >
          {agent.name}
        </span>
        <span className="text-muted-foreground/70 text-xs ml-1.5">
          {displayText}
          {isTyping && displayText.length < fullText.length && (
            <span className="typing-cursor ml-0.5 text-white">▋</span>
          )}
        </span>
        {isWorking && (
          <div className="mt-1">
            <ProgressBar progress={0.7} />
          </div>
        )}
      </div>
    </div>
  );
};

export default function NeuralStream({ className = '' }: NeuralStreamProps) {
  const { activities, agents } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [displayedActivities, setDisplayedActivities] = useState<AgentActivity[]>([]);
  const prevCountRef = useRef(0);

  // Get recent activities (last 8)
  const recentActivities = activities.slice(0, 8).reverse();

  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [recentActivities.length]);

  // Track which activity is new for typing animation
  useEffect(() => {
    const prevCount = prevCountRef.current;
    const newCount = recentActivities.length;

    if (newCount > prevCount) {
      setDisplayedActivities(recentActivities);
    } else {
      setDisplayedActivities(recentActivities);
    }

    prevCountRef.current = newCount;
  }, [recentActivities]);

  // Count active agents
  const activeCount = agents.filter((a) => a.status === 'working').length;

  // Get working agent roles
  const workingRoles = agents
    .filter((a) => a.status === 'working')
    .map((a) => a.role);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Neural Stream
          </h2>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          LIVE
        </span>
      </div>

      {/* Terminal Container */}
      <div className="relative flex-1 bg-black/40 rounded-lg border border-border/50 overflow-hidden neural-scanlines">
        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none neural-scanlines-overlay" />

        {/* Activity Stream */}
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto scrollbar-thin py-2 font-mono"
          style={{ maxHeight: '240px' }}
        >
          {displayedActivities.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
              <span className="typing-cursor">▋</span>
              <span className="ml-2">Awaiting agent activity...</span>
            </div>
          ) : (
            displayedActivities.map((activity, index) => {
              const isNewest = index === displayedActivities.length - 1;
              const isAgentWorking = workingRoles.includes(activity.agentRole);
              return (
                <ActivityEntry
                  key={activity.id}
                  activity={activity}
                  isTyping={isNewest && activities.length > prevCountRef.current}
                  isWorking={isAgentWorking}
                />
              );
            })
          )}
        </div>

        {/* Blinking cursor at bottom */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-muted-foreground/30 text-xs font-mono">
          <span className="typing-cursor text-white/50">█</span>
          <span>Listening...</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-success/50" />
          {activeCount} agent{activeCount !== 1 ? 's' : ''} active
        </span>
        <span className="font-mono">
          {recentActivities.length} events
        </span>
      </div>
    </div>
  );
}

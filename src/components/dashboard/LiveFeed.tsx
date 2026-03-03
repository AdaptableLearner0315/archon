'use client';

import { useAppStore } from '@/lib/store';
import { Activity } from 'lucide-react';

export default function LiveFeed() {
  const { activities } = useAppStore();

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const typeColors = {
    action: 'border-l-primary',
    insight: 'border-l-warning',
    milestone: 'border-l-success',
    alert: 'border-l-danger',
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Live Feed
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[440px] overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm">Agents are spinning up...</p>
            <p className="text-xs mt-1">Activity will appear here in real-time</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className={`flex gap-3 py-2.5 px-3 rounded-lg border-l-2 ${typeColors[activity.type]} hover:bg-secondary/30 transition fade-in`}
            >
              <span className="text-xs text-muted-foreground font-mono w-12 flex-shrink-0 pt-0.5">
                {formatTime(activity.timestamp)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
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
          ))
        )}
      </div>
    </div>
  );
}

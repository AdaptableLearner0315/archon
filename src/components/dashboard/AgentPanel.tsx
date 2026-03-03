'use client';

import { useAppStore } from '@/lib/store';

export default function AgentPanel() {
  const { agents } = useAppStore();

  const activeCount = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Agents
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {activeCount} active
        </span>
      </div>

      <div className="space-y-1">
        {agents.map((agent) => (
          <div
            key={agent.role}
            className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-secondary/50 transition group"
          >
            {/* Status indicator */}
            <div className="relative">
              <span className="text-xl">{agent.icon}</span>
              {agent.status === 'working' && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success pulse-dot" />
              )}
              {agent.status === 'completed' && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary" />
              )}
              {agent.status === 'error' && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger" />
              )}
            </div>

            {/* Agent info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{agent.name}</span>
                <span className="text-xs text-muted-foreground">{agent.title}</span>
              </div>
              {agent.currentTask && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {agent.currentTask}
                </p>
              )}
            </div>

            {/* Status badge */}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                agent.status === 'working'
                  ? 'bg-success/10 text-success'
                  : agent.status === 'completed'
                  ? 'bg-primary/10 text-primary'
                  : agent.status === 'error'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {agent.status === 'working'
                ? 'Working'
                : agent.status === 'completed'
                ? 'Done'
                : agent.status === 'error'
                ? 'Error'
                : 'Idle'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

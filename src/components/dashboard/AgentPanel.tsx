'use client';

import { useAppStore } from '@/lib/store';
import type { AgentRole } from '@/lib/types';

/**
 * AgentPanel Component
 *
 * Displays all agents with their current status.
 * Highlights agents participating in team tasks with warning color ring.
 */
export default function AgentPanel() {
  const { agents, activeTeamTask } = useAppStore();

  const activeCount = agents.filter((a) => a.status === 'working').length;
  const teamAgentRoles = activeTeamTask?.agents || [];

  /**
   * Check if an agent is part of the active team task
   */
  const isTeamMember = (role: AgentRole): boolean => {
    return teamAgentRoles.includes(role);
  };

  /**
   * Get the appropriate badge text for an agent
   */
  const getBadgeText = (status: string, role: AgentRole): string => {
    if (activeTeamTask && isTeamMember(role)) {
      if (activeTeamTask.status === 'merging') return 'Merging';
      return 'Team';
    }
    switch (status) {
      case 'working': return 'Working';
      case 'completed': return 'Done';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  /**
   * Get badge color classes based on status and team membership
   */
  const getBadgeClasses = (status: string, role: AgentRole): string => {
    if (activeTeamTask && isTeamMember(role)) {
      return 'bg-warning/10 text-warning';
    }
    switch (status) {
      case 'working': return 'bg-success/10 text-success';
      case 'completed': return 'bg-primary/10 text-primary';
      case 'error': return 'bg-danger/10 text-danger';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Agents
        </h2>
        <div className="flex items-center gap-2">
          {activeTeamTask && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium animate-pulse">
              Team Active
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {activeCount} active
          </span>
        </div>
      </div>

      {/* Team Task Banner */}
      {activeTeamTask && (
        <div className="mb-4 p-3 rounded-lg bg-warning/5 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-warning pulse-dot" />
            <span className="text-xs font-semibold text-warning uppercase tracking-wider">
              {activeTeamTask.status === 'merging' ? 'Merging Results' : 'Team Task'}
            </span>
          </div>
          <p className="text-sm text-foreground/80 line-clamp-2">
            {activeTeamTask.description}
          </p>
          <div className="flex gap-1 mt-2">
            {activeTeamTask.agents.map((role) => {
              const agent = agents.find((a) => a.role === role);
              return (
                <span
                  key={role}
                  className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning"
                >
                  {agent?.icon} {agent?.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent List */}
      <div className="space-y-1">
        {agents.map((agent) => {
          const inTeam = isTeamMember(agent.role);

          return (
            <div
              key={agent.role}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition group ${
                inTeam
                  ? 'bg-warning/5 ring-1 ring-warning/30 hover:bg-warning/10'
                  : 'hover:bg-secondary/50'
              }`}
            >
              {/* Status indicator with team ring */}
              <div className="relative">
                <span className={`text-xl ${inTeam ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]' : ''}`}>
                  {agent.icon}
                </span>
                {agent.status === 'working' && (
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full pulse-dot ${
                    inTeam ? 'bg-warning' : 'bg-success'
                  }`} />
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
                  {inTeam && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning font-medium">
                      TEAM
                    </span>
                  )}
                </div>
                {agent.currentTask && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {agent.currentTask}
                  </p>
                )}
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getBadgeClasses(agent.status, agent.role)}`}>
                {getBadgeText(agent.status, agent.role)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

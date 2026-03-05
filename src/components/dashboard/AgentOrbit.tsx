'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { Agent, AgentRole } from '@/lib/types';

interface AgentOrbitProps {
  onAgentClick?: (agent: Agent) => void;
  compact?: boolean;
}

export default function AgentOrbit({ onAgentClick, compact = false }: AgentOrbitProps) {
  const { agents, activities } = useAppStore();
  const [hoveredAgent, setHoveredAgent] = useState<AgentRole | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Only show core 10 agents (not Scale tier extras)
  const coreAgents = useMemo(() => {
    const coreRoles: AgentRole[] = [
      'ceo', 'engineer', 'growth', 'marketing', 'product',
      'operations', 'sales', 'support', 'data-analyst', 'customer-success'
    ];
    return agents.filter(a => coreRoles.includes(a.role));
  }, [agents]);

  // Calculate positions in a circle
  const agentPositions = useMemo(() => {
    const radius = compact ? 85 : 120;
    const centerX = compact ? 110 : 150;
    const centerY = compact ? 110 : 150;

    return coreAgents.map((agent, index) => {
      const angle = (index / coreAgents.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return { agent, x, y, angle };
    });
  }, [coreAgents, compact]);

  // Get recent activity for an agent
  const getRecentActivity = (role: AgentRole) => {
    return activities.find(a => a.agentRole === role);
  };

  // Count active agents
  const activeCount = coreAgents.filter(a => a.status === 'working').length;

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(selectedAgent?.role === agent.role ? null : agent);
    onAgentClick?.(agent);
  };

  return (
    <div className={compact ? '' : 'bg-card border border-border rounded-xl p-5'}>
      {/* Header (hidden in compact mode as parent handles it) */}
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Agent Activity Map
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-medium">
            {activeCount} active
          </span>
        </div>
      )}

      {/* Orbit Visualization */}
      <div className={`relative mx-auto ${compact ? 'w-[220px] h-[220px]' : 'w-[300px] h-[300px]'}`}>
        <svg width={compact ? 220 : 300} height={compact ? 220 : 300} className="absolute inset-0">
          {/* Orbital rings */}
          <circle
            cx={compact ? 110 : 150}
            cy={compact ? 110 : 150}
            r={compact ? 85 : 120}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <circle
            cx={compact ? 110 : 150}
            cy={compact ? 110 : 150}
            r={compact ? 55 : 80}
            fill="none"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1"
          />
          <circle
            cx={compact ? 110 : 150}
            cy={compact ? 110 : 150}
            r={compact ? 28 : 40}
            fill="none"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1"
          />

          {/* Connection lines to center */}
          {agentPositions.map(({ agent, x, y }) => (
            <line
              key={`line-${agent.role}`}
              x1={compact ? 110 : 150}
              y1={compact ? 110 : 150}
              x2={x}
              y2={y}
              stroke={
                agent.status === 'working'
                  ? 'rgba(255, 255, 255, 0.3)'
                  : agent.status === 'completed'
                  ? 'rgba(255, 255, 255, 0.15)'
                  : 'rgba(255, 255, 255, 0.05)'
              }
              strokeWidth="1"
              className={agent.status === 'working' ? 'animate-pulse' : ''}
            />
          ))}
        </svg>

        {/* Center - Company/CEO icon */}
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-white/15 to-white/5 border border-white/30 flex items-center justify-center ${compact ? 'w-12 h-12' : 'w-16 h-16'}`}>
          <span className={compact ? 'text-xl' : 'text-2xl'}>🎯</span>
          <div className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-30" />
        </div>

        {/* Agent nodes */}
        {agentPositions.map(({ agent, x, y }) => {
          const isHovered = hoveredAgent === agent.role;
          const isSelected = selectedAgent?.role === agent.role;
          const isWorking = agent.status === 'working';
          const isCompleted = agent.status === 'completed';

          return (
            <button
              key={agent.role}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 focus:outline-none ${
                isHovered || isSelected ? 'scale-125 z-10' : ''
              }`}
              style={{ left: x, top: y }}
              onMouseEnter={() => setHoveredAgent(agent.role)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => handleAgentClick(agent)}
            >
              <div
                className={`rounded-full flex items-center justify-center relative transition-all ${
                  compact ? 'w-8 h-8' : 'w-10 h-10'
                } ${
                  isWorking
                    ? 'bg-white/15 border-2 border-white/50 agent-glow'
                    : isCompleted
                    ? 'bg-white/10 border-2 border-white/30'
                    : 'bg-secondary border border-border hover:border-white/20'
                }`}
              >
                <span className={compact ? 'text-sm' : 'text-lg'}>{agent.icon}</span>
                {isWorking && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white pulse-dot" />
                )}
                {isCompleted && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white/50" />
                )}
              </div>

              {/* Tooltip */}
              {(isHovered || isSelected) && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-16 w-40 bg-card border border-border rounded-lg p-2 shadow-xl z-20">
                  <p className="text-xs font-semibold text-center">{agent.name}</p>
                  <p className="text-[10px] text-muted-foreground text-center">{agent.title}</p>
                  {agent.currentTask && (
                    <p className="text-[10px] text-white/80 text-center mt-1 truncate">
                      {agent.currentTask}
                    </p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Compact mode active count */}
      {compact && (
        <div className="text-center mt-2">
          <span className="text-[10px] text-muted-foreground/60">
            {activeCount} active
          </span>
        </div>
      )}

      {/* Selected Agent Detail (hidden in compact mode) */}
      {selectedAgent && !compact && (
        <div className="mt-4 p-3 bg-secondary/30 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{selectedAgent.icon}</span>
            <div>
              <p className="text-sm font-semibold">{selectedAgent.name}</p>
              <p className="text-xs text-muted-foreground">{selectedAgent.title}</p>
            </div>
            <span
              className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                selectedAgent.status === 'working'
                  ? 'bg-white/10 text-white/80'
                  : selectedAgent.status === 'completed'
                  ? 'bg-white/10 text-white/70'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {selectedAgent.status === 'working'
                ? 'Working'
                : selectedAgent.status === 'completed'
                ? 'Done'
                : 'Idle'}
            </span>
          </div>
          {selectedAgent.currentTask && (
            <p className="text-xs text-muted-foreground">{selectedAgent.currentTask}</p>
          )}
          {getRecentActivity(selectedAgent.role) && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">
                Recent Activity
              </p>
              <p className="text-xs text-foreground/80">
                {getRecentActivity(selectedAgent.role)?.action}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { create } from 'zustand';
import type {
  AgentActivity,
  CommandMessage,
  KPIMetric,
  Agent,
  OnboardingState,
  AgentRole,
  OperatingCycle,
  CycleTask,
  CycleStreamEvent,
} from './types';
import { AGENTS } from './types';
import { v4 as uuid } from 'uuid';

interface AppState {
  // Agents
  agents: Agent[];
  updateAgentStatus: (role: AgentRole, status: Agent['status'], task?: string) => void;

  // Activities
  activities: AgentActivity[];
  addActivity: (activity: Omit<AgentActivity, 'id' | 'timestamp'>) => void;

  // Metrics
  metrics: KPIMetric[];
  setMetrics: (metrics: KPIMetric[]) => void;

  // Command Center
  messages: CommandMessage[];
  addMessage: (message: Omit<CommandMessage, 'id' | 'timestamp'>) => void;
  isCommandLoading: boolean;
  setCommandLoading: (loading: boolean) => void;

  // Onboarding
  onboarding: OnboardingState;
  setOnboarding: (state: Partial<OnboardingState>) => void;

  // Company
  companyId: string | null;
  setCompanyId: (id: string) => void;

  // Operating Cycles
  currentCycle: OperatingCycle | null;
  setCycle: (cycle: OperatingCycle | null) => void;
  cycleTasks: CycleTask[];
  setCycleTasks: (tasks: CycleTask[]) => void;
  updateCycleTask: (taskId: string, updates: Partial<CycleTask>) => void;
  cycleEvents: CycleStreamEvent[];
  addCycleEvent: (event: CycleStreamEvent) => void;
  clearCycleEvents: () => void;

  // Team Task State
  activeTeamTask: {
    id: string;
    description: string;
    agents: AgentRole[];
    status: 'running' | 'merging' | 'completed';
  } | null;
  setActiveTeamTask: (task: AppState['activeTeamTask']) => void;
  clearActiveTeamTask: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  agents: AGENTS.map((a) => ({
    ...a,
    id: uuid(),
    status: 'idle' as const,
    currentTask: null,
  })),
  updateAgentStatus: (role, status, task) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.role === role ? { ...a, status, currentTask: task ?? a.currentTask } : a
      ),
    })),

  activities: [],
  addActivity: (activity) =>
    set((state) => ({
      activities: [
        { ...activity, id: uuid(), timestamp: new Date().toISOString() },
        ...state.activities,
      ].slice(0, 100),
    })),

  metrics: [
    { label: 'Revenue', value: '$0', change: 0, trend: 'neutral' },
    { label: 'Users', value: '0', change: 0, trend: 'neutral' },
    { label: 'Signups Today', value: '0', change: 0, trend: 'neutral' },
    { label: 'Conversion', value: '0%', change: 0, trend: 'neutral' },
  ],
  setMetrics: (metrics) => set({ metrics }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id: uuid(), timestamp: new Date().toISOString() },
      ],
    })),
  isCommandLoading: false,
  setCommandLoading: (loading) => set({ isCommandLoading: loading }),

  onboarding: { step: 1, idea: '', goal: null, adBudget: null },
  setOnboarding: (partial) =>
    set((state) => ({ onboarding: { ...state.onboarding, ...partial } })),

  companyId: null,
  setCompanyId: (id) => set({ companyId: id }),

  // Operating Cycles
  currentCycle: null,
  setCycle: (cycle) => set({ currentCycle: cycle }),
  cycleTasks: [],
  setCycleTasks: (tasks) => set({ cycleTasks: tasks }),
  updateCycleTask: (taskId, updates) =>
    set((state) => ({
      cycleTasks: state.cycleTasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    })),
  cycleEvents: [],
  addCycleEvent: (event) =>
    set((state) => ({
      cycleEvents: [...state.cycleEvents, event].slice(-500),
    })),
  clearCycleEvents: () => set({ cycleEvents: [] }),

  // Team Task State
  activeTeamTask: null,
  setActiveTeamTask: (task) => set({ activeTeamTask: task }),
  clearActiveTeamTask: () => set({ activeTeamTask: null }),
}));

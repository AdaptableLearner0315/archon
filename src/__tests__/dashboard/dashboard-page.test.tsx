import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Use vi.hoisted to define mocks that are available in vi.mock factories
const {
  mockReplace,
  mockPush,
  mockGetUser,
  mockSingle,
  mockSetCompanyId,
  mockAddActivity,
  mockSetMetrics,
  mockUpdateAgentStatus,
} = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockGetUser: vi.fn(),
  mockSingle: vi.fn(),
  mockSetCompanyId: vi.fn(),
  mockAddActivity: vi.fn(),
  mockSetMetrics: vi.fn(),
  mockUpdateAgentStatus: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock Supabase client — every chain terminus returns mockSingle()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: () => {
      const chainEnd = () => ({
        single: () => mockSingle(),
        order: (..._a: unknown[]) => chainEnd(),
        limit: (..._a: unknown[]) => ({ ...chainEnd(), single: () => mockSingle() }),
        eq: (..._a: unknown[]) => chainEnd(),
        in: (..._a: unknown[]) => mockSingle(),
      });
      return { select: () => chainEnd() };
    },
  }),
}));

// Mock Zustand store
vi.mock('@/lib/store', () => ({
  useAppStore: Object.assign(
    () => ({
      setCompanyId: mockSetCompanyId,
      addActivity: mockAddActivity,
      setMetrics: mockSetMetrics,
    }),
    { getState: () => ({ updateAgentStatus: mockUpdateAgentStatus }) }
  ),
}));

// Mock all dashboard sub-components to isolate page logic
vi.mock('@/components/dashboard/ActivityHero', () => ({
  default: () => <div data-testid="activity-hero" />,
}));
vi.mock('@/components/dashboard/MetricsRow', () => ({
  default: () => <div data-testid="metrics-row" />,
}));
vi.mock('@/components/dashboard/AgentOrbit', () => ({
  default: () => <div data-testid="agent-orbit" />,
}));
vi.mock('@/components/dashboard/NeuralStream', () => ({
  default: () => <div data-testid="neural-stream" />,
}));
vi.mock('@/components/dashboard/WinsCarousel', () => ({
  default: () => <div data-testid="wins-carousel" />,
}));
vi.mock('@/components/dashboard/PriorityCards', () => ({
  default: () => <div data-testid="priority-cards" />,
}));
vi.mock('@/components/dashboard/LiveFeed', () => ({
  default: () => <div data-testid="live-feed" />,
}));
vi.mock('@/components/command-center/CommandCenter', () => ({
  default: () => <div data-testid="command-center" />,
}));
vi.mock('@/components/dashboard/DashboardNav', () => ({
  default: ({ companyName }: { companyName: string }) => <div data-testid="dashboard-nav">{companyName}</div>,
}));
vi.mock('@/components/dashboard/ProfileIncompleteNotification', () => ({
  ProfileIncompleteNotification: () => null,
}));
vi.mock('@/components/dashboard/InfrastructureBuildingStatus', () => ({
  InfrastructureBuildingStatus: () => null,
}));
vi.mock('@/components/ui/Celebration', () => ({
  Celebration: () => null,
}));
vi.mock('@/lib/hooks/useMilestones', () => ({
  useMilestones: () => ({
    checkMilestone: vi.fn(),
    markMilestone: vi.fn(),
    shouldCelebrate: false,
    pendingCelebration: null,
    clearCelebration: vi.fn(),
  }),
}));
vi.mock('@/lib/types', () => ({
  AGENTS: [],
}));

import DashboardPage from '@/app/dashboard/page';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    // Make getUser hang to keep loading state
    mockGetUser.mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />);

    expect(screen.getByText('Loading your AI organization...')).toBeInTheDocument();
  });

  it('loads company data on mount', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    // Sequential mock returns: 1) company, 2) activities, 3) metrics, 4) infra assets, 5) infra jobs
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1', name: 'TestCo', slug: 'testco', user_id: 'user-1' } })
      .mockResolvedValueOnce({ data: [] }) // activities
      .mockResolvedValueOnce({ data: null }) // metrics
      .mockResolvedValueOnce({ data: [] }) // infra assets
      .mockResolvedValueOnce({ data: [] }); // infra jobs

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockSetCompanyId).toHaveBeenCalledWith('comp-1');
    });
  });

  it('does NOT call router.replace when no company (layout handles it)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({ data: null });

    render(<DashboardPage />);

    // Wait for the effect to run
    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalled();
    });

    // Give it time for async operations to settle
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT redirect — layout already handles this server-side
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('only runs loadCompany once (guard ref)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1', name: 'TestCo', slug: 'testco', user_id: 'user-1' } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const { rerender } = render(<DashboardPage />);

    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });

    // Re-render shouldn't trigger another load
    rerender(<DashboardPage />);

    // Still only called once
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });
});

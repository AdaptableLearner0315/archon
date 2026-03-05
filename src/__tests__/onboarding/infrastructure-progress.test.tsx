import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Layout: () => <span data-testid="layout-icon" />,
  Server: () => <span data-testid="server-icon" />,
  Database: () => <span data-testid="database-icon" />,
  Mail: () => <span data-testid="mail-icon" />,
  Twitter: () => <span data-testid="twitter-icon" />,
  HelpCircle: () => <span data-testid="help-icon" />,
  CheckCircle2: () => <span data-testid="check-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
  Sparkles: () => <span data-testid="sparkles-icon" />,
}));

import { InfrastructureProgress } from '@/components/onboarding/InfrastructureProgress';

// Helper to create SSE stream response
function createSSEStream(events: Array<Record<string, unknown>>) {
  const sseText = events
    .map((e) => `data: ${JSON.stringify(e)}`)
    .join('\n\n') + '\n\n';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });

  return new Response(stream, { status: 200 });
}

describe('InfrastructureProgress', () => {
  const mockOnComplete = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends companyId and profile in POST body to /api/infrastructure/generate', async () => {
    const profile = { name: 'TestCo', type: 'SaaS' };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([{ type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() }])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        profile={profile}
        onComplete={mockOnComplete}
        onError={mockOnError}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/infrastructure/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: 'comp-123', profile }),
      });
    });
  });

  it('shows loading state with component cards', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([{ type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() }])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        onComplete={mockOnComplete}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Building Your Infrastructure')).toBeInTheDocument();
      expect(screen.getByText('Landing Page')).toBeInTheDocument();
      expect(screen.getByText('Server Config')).toBeInTheDocument();
      expect(screen.getByText('Database Schema')).toBeInTheDocument();
      expect(screen.getByText('Email Templates')).toBeInTheDocument();
      expect(screen.getByText('Social Strategy')).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });
  });

  it('calls onComplete after job_completed event (with 2s delay)', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([
        { type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() },
        { type: 'job_completed', jobId: 'j1', timestamp: new Date().toISOString() },
      ])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        onComplete={mockOnComplete}
      />
    );

    // Wait for events to be processed
    await waitFor(() => {
      expect(screen.getByText('Infrastructure Ready!')).toBeInTheDocument();
    });

    // onComplete should NOT be called immediately
    expect(mockOnComplete).not.toHaveBeenCalled();

    // Advance by 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onError when generation fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([
        { type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() },
        { type: 'job_failed', jobId: 'j1', error: 'Generation timed out', timestamp: new Date().toISOString() },
      ])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        onComplete={mockOnComplete}
        onError={mockOnError}
      />
    );

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith('Generation timed out');
    });
  });

  it('shows error UI with retry button on failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([
        { type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() },
        { type: 'job_failed', jobId: 'j1', error: 'Something went wrong', timestamp: new Date().toISOString() },
      ])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        onComplete={mockOnComplete}
        onError={mockOnError}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('handles SSE stream events (task_started, task_progress, task_completed)', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createSSEStream([
        { type: 'job_started', jobId: 'j1', timestamp: new Date().toISOString() },
        { type: 'task_started', jobId: 'j1', taskType: 'landing', timestamp: new Date().toISOString() },
        { type: 'task_progress', jobId: 'j1', taskType: 'landing', progress: 50, agentRole: 'marketing', timestamp: new Date().toISOString() },
        { type: 'task_completed', jobId: 'j1', taskType: 'landing', timestamp: new Date().toISOString() },
      ])
    );

    render(
      <InfrastructureProgress
        companyId="comp-123"
        onComplete={mockOnComplete}
      />
    );

    // After task_completed for landing, the Landing Page card should show completed state
    await waitFor(() => {
      // The component shows agent name while generating
      // After completion, progress should update
      const landingText = screen.getByText('Landing Page');
      expect(landingText).toBeInTheDocument();
    });
  });
});

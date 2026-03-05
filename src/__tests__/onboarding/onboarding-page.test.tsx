import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Use vi.hoisted so mock router is available in vi.mock factory
const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockPush: push,
    mockRouter: {
      push,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    },
  };
});

// Mock next/navigation — return the SAME stable object each time
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Track onComplete prop reference stability
let capturedOnComplete: ((profile: Record<string, unknown>) => void) | null = null;

// Mock OnboardingChat to capture and test props
vi.mock('@/components/onboarding', () => ({
  OnboardingChat: ({ onComplete }: { onComplete: (profile: Record<string, unknown>) => void }) => {
    capturedOnComplete = onComplete;
    return <div data-testid="onboarding-chat" />;
  },
}));

import OnboardingPage from '@/app/onboarding/page';

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnComplete = null;
  });

  it('renders OnboardingChat component', () => {
    render(<OnboardingPage />);

    expect(screen.getByTestId('onboarding-chat')).toBeInTheDocument();
    expect(screen.getByText("Let's get to know each other")).toBeInTheDocument();
  });

  it('handleComplete is stable across renders (memoized)', () => {
    const { rerender } = render(<OnboardingPage />);

    const firstRef = capturedOnComplete;
    expect(firstRef).not.toBeNull();

    rerender(<OnboardingPage />);

    const secondRef = capturedOnComplete;

    // With useCallback and stable router dep, the reference should be the same
    expect(firstRef).toBe(secondRef);
  });

  it('navigates to /dashboard when onComplete is called', () => {
    render(<OnboardingPage />);

    expect(capturedOnComplete).not.toBeNull();
    capturedOnComplete!({ businessName: 'TestCo' });

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});

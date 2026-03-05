import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';

const { Stub, mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    Stub: () => null,
    mockPush: push,
    mockRouter: { push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('framer-motion', () => ({
  motion: { div: 'div', p: 'p', h1: 'h1', button: 'button' },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('lucide-react', () => ({
  Send: Stub, Loader2: Stub, ArrowRight: Stub, Sparkles: Stub, Dice5: Stub,
  Layout: Stub, Server: Stub, Database: Stub, Mail: Stub, Twitter: Stub,
  HelpCircle: Stub, CheckCircle2: Stub, AlertCircle: Stub, Zap: Stub,
  Mic: Stub, MicOff: Stub, Volume2: Stub, TrendingUp: Stub, Users: Stub,
  Target: Stub, Lightbulb: Stub, ExternalLink: Stub, Check: Stub,
}));
vi.mock('@/components/onboarding/VoiceButton', () => ({ VoiceButton: Stub }));
vi.mock('@/components/onboarding/ChatMessage', () => ({
  ChatMessage: ({ content }: { content: string }) => <div data-testid="chat-msg">{content}</div>,
  TypingIndicator: Stub,
}));
vi.mock('@/components/onboarding/InfrastructureProgress', () => ({
  InfrastructureProgress: ({ companyId, profile, onComplete, onError }: {
    companyId: string; profile?: Record<string, unknown>;
    onComplete: () => void; onError?: (e: string) => void;
  }) => (
    <div data-testid="infra-progress" data-company-id={companyId}>
      <button data-testid="infra-done" onClick={onComplete}>Done</button>
      <button data-testid="infra-err" onClick={() => onError?.('err')}>Err</button>
      {profile && <span data-testid="infra-profile">{JSON.stringify(profile)}</span>}
    </div>
  ),
}));

import { OnboardingChat } from '@/components/onboarding/OnboardingChat';

function jsonResp(data: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } });
}
function sseResp(events: Array<Record<string, unknown>>) {
  const txt = events.map(e => `data: ${JSON.stringify(e)}`).join('\n\n') + '\n\n';
  return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(txt)); c.close(); },
  }), { status: 200 });
}

const concept = {
  companyName: 'TestCo', businessDescription: 'AI testing', businessType: 'SaaS',
  targetAudience: { primary: 'Devs', painPoints: ['slow'] },
  competitors: [{ name: 'X', weakness: 'slow' }],
  keyFeatures: ['AI'], uniqueValueProp: 'Fast', brandTone: 'Pro',
};

// Stored conversation so we skip the greeting streaming entirely
const storedConvo = {
  messages: [{ id: '1', role: 'atlas', content: 'Hi there!' }],
  phase: 'welcome', progress: 10, timestamp: Date.now(),
};

describe('OnboardingChat', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(global.fetch).mockResolvedValue(jsonResp({ ok: true }));
  });
  afterEach(() => vi.useRealTimers());

  async function flush(ms = 1000) {
    await act(async () => { vi.advanceTimersByTime(ms); });
  }

  async function mountWithStored(fetchImpl?: (url: RequestInfo | URL) => Promise<Response>) {
    if (fetchImpl) vi.mocked(global.fetch).mockImplementation(fetchImpl);
    sessionStorage.setItem('archon_onboarding_conversation', JSON.stringify(storedConvo));
    render(<OnboardingChat onComplete={onComplete} />);
    await flush(100);
  }

  // --- Initialization ---

  it('renders initial Atlas greeting on mount', async () => {
    render(<OnboardingChat onComplete={onComplete} />);
    for (let i = 0; i < 20; i++) await flush(500);
    expect(screen.getByText(/Hey!/)).toBeInTheDocument();
  });

  it('restores conversation from sessionStorage', async () => {
    sessionStorage.setItem('archon_onboarding_conversation', JSON.stringify({
      messages: [
        { id: '1', role: 'atlas', content: 'Saved msg' },
        { id: '2', role: 'user', content: 'My reply' },
      ],
      phase: 'business_basics', progress: 30, timestamp: Date.now(),
    }));
    render(<OnboardingChat onComplete={onComplete} />);
    await flush(100);
    expect(screen.getByText('Saved msg')).toBeInTheDocument();
    expect(screen.getByText('My reply')).toBeInTheDocument();
  });

  // --- Surprise Me ---

  it('shows SurpriseLoading when surprise is loading', async () => {
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise')) return new Promise(() => {});
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(100);
    expect(screen.getByText(/dreaming up a business/)).toBeInTheDocument();
  });

  it('shows ConceptReveal after surprise generates', async () => {
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise') && !url.includes('confirm'))
        return Promise.resolve(jsonResp({ concept }));
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(200);
    expect(screen.getByText('TestCo')).toBeInTheDocument();
    expect(screen.getByText("Love it, let's build!")).toBeInTheDocument();
  });

  it('shows InfrastructureProgress after confirm, not dashboard redirect', async () => {
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise/confirm'))
        return Promise.resolve(jsonResp({ companyId: 'c1', profile: { n: 1 } }));
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise'))
        return Promise.resolve(jsonResp({ concept }));
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(200);
    fireEvent.click(screen.getByText("Love it, let's build!"));
    await flush(200);
    expect(screen.getByTestId('infra-progress')).toHaveAttribute('data-company-id', 'c1');
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls onComplete when infrastructure completes', async () => {
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise/confirm'))
        return Promise.resolve(jsonResp({ companyId: 'c1', profile: { n: 1 } }));
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise'))
        return Promise.resolve(jsonResp({ concept }));
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(200);
    fireEvent.click(screen.getByText("Love it, let's build!"));
    await flush(200);
    fireEvent.click(screen.getByTestId('infra-done'));
    expect(onComplete).toHaveBeenCalledWith({ n: 1 });
  });

  it('calls onComplete on infrastructure error (graceful fallback)', async () => {
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise/confirm'))
        return Promise.resolve(jsonResp({ companyId: 'c1', profile: { n: 1 } }));
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise'))
        return Promise.resolve(jsonResp({ concept }));
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(200);
    fireEvent.click(screen.getByText("Love it, let's build!"));
    await flush(200);
    fireEvent.click(screen.getByTestId('infra-err'));
    expect(onComplete).toHaveBeenCalledWith({ n: 1 });
  });

  it('allows re-rolling up to MAX_REROLLS(3) times', async () => {
    let n = 0;
    await mountWithStored((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/surprise') && !url.includes('confirm')) {
        n++;
        return Promise.resolve(jsonResp({ concept: { ...concept, companyName: `Co${n}` } }));
      }
      return Promise.resolve(jsonResp({ ok: true }));
    });
    fireEvent.click(screen.getByText(/Surprise Me/));
    await flush(200);
    expect(screen.getByText('Co1')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      const btn = screen.queryByText('Re-roll');
      if (!btn) break;
      fireEvent.click(btn);
      await flush(200);
    }
    expect(screen.queryByText('Re-roll')).not.toBeInTheDocument();
  });

  // --- Normal completion ---

  it('normal completion shows InfrastructureProgress (no premature nav)', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/onboarding/chat'))
        return Promise.resolve(sseResp([
          { type: 'text', content: 'Done!' },
          { type: 'complete', profile: { biz: 'X' } },
        ]));
      if (typeof url === 'string' && url.includes('/api/onboarding/complete'))
        return Promise.resolve(jsonResp({ companyId: 'c2', profile: { biz: 'X' } }));
      return Promise.resolve(jsonResp({ ok: true }));
    });

    sessionStorage.setItem('archon_onboarding_conversation', JSON.stringify({
      messages: [{ id: '1', role: 'atlas', content: 'Hi' }, { id: '2', role: 'user', content: 'Hello' }],
      phase: 'closing', progress: 90, timestamp: Date.now(),
    }));
    render(<OnboardingChat onComplete={onComplete} />);
    await flush(100);

    const textarea = screen.getByPlaceholderText('Type your message...');
    fireEvent.change(textarea, { target: { value: 'Go!' } });
    const btns = screen.getAllByRole('button');
    const sendBtn = btns[btns.length - 2];
    await act(async () => { fireEvent.click(sendBtn); });
    for (let i = 0; i < 10; i++) await flush(500);

    expect(screen.getByTestId('infra-progress')).toBeInTheDocument();
    expect(screen.getByTestId('infra-profile')).toHaveTextContent('biz');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

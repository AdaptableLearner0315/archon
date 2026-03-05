import { describe, it, expect } from 'vitest';
import {
  createConversationEngine,
  type ConversationPhase,
  type OnboardingProfile,
} from '@/lib/onboarding/conversation-engine';

describe('ConversationEngine', () => {
  describe('initialization', () => {
    it('should start in welcome phase by default', () => {
      const engine = createConversationEngine();
      expect(engine.getCurrentPhase()).toBe('welcome');
    });

    it('should accept initial phase', () => {
      const engine = createConversationEngine({ phase: 'exploring' });
      expect(engine.getCurrentPhase()).toBe('exploring');
    });

    it('should accept initial message count', () => {
      const engine = createConversationEngine({ phase: 'exploring', messageCount: 2 });
      const state = engine.getState();
      expect(state.messageCount).toBe(2);
    });
  });

  describe('phase transitions', () => {
    it('should transition from welcome to exploring after 1 message', () => {
      const engine = createConversationEngine({ phase: 'welcome' });
      const result = engine.processMessage({});
      expect(result.newPhase).toBe('exploring');
    });

    it('should stay in exploring phase when no data collected', () => {
      const engine = createConversationEngine({ phase: 'exploring', messageCount: 0 });
      const result = engine.processMessage({});
      expect(result.newPhase).toBe('exploring');
    });

    it('should transition to complete when both data points collected', () => {
      const engine = createConversationEngine({ phase: 'exploring' });
      const result = engine.processMessage({
        businessDescription: 'An invoicing platform for freelancers',
        biggestPainPoint: 'Chasing late payments from clients',
      });
      expect(result.newPhase).toBe('complete');
      expect(result.isComplete).toBe(true);
    });

    it('should stay in exploring with only businessDescription', () => {
      const engine = createConversationEngine({ phase: 'exploring', messageCount: 0 });
      const result = engine.processMessage({
        businessDescription: 'SaaS for restaurants',
      });
      expect(result.newPhase).toBe('exploring');
      expect(result.progress).toBe(50);
    });

    it('should complete when user indicates done', () => {
      const engine = createConversationEngine({ phase: 'exploring' });
      const result = engine.processMessage({}, true);
      expect(result.newPhase).toBe('complete');
      expect(result.isComplete).toBe(true);
    });

    it('should force complete after max messages (8)', () => {
      const engine = createConversationEngine({ phase: 'exploring', messageCount: 7 });
      const result = engine.processMessage({});
      expect(result.newPhase).toBe('complete');
      expect(result.isComplete).toBe(true);
    });
  });

  describe('progress tracking', () => {
    it('should report 0% progress with no data', () => {
      const engine = createConversationEngine();
      expect(engine.calculateProgress()).toBe(0);
    });

    it('should report 50% progress with businessDescription only', () => {
      const engine = createConversationEngine({
        extractedData: { businessDescription: 'A SaaS for managing restaurant orders' },
      });
      expect(engine.calculateProgress()).toBe(50);
    });

    it('should report 50% progress with biggestPainPoint only', () => {
      const engine = createConversationEngine({
        extractedData: { biggestPainPoint: 'Cannot manage inventory efficiently' },
      });
      expect(engine.calculateProgress()).toBe(50);
    });

    it('should report 100% progress with both data points', () => {
      const engine = createConversationEngine({
        extractedData: {
          businessDescription: 'A SaaS for managing restaurant orders',
          biggestPainPoint: 'Cannot manage inventory efficiently',
        },
      });
      expect(engine.calculateProgress()).toBe(100);
    });
  });

  describe('extracted data accumulation', () => {
    it('should accumulate extracted data across messages', () => {
      const engine = createConversationEngine({ phase: 'exploring' });

      engine.processMessage({ businessDescription: 'SaaS for restaurants' });
      engine.processMessage({ targetAudience: { primary: 'Restaurant owners', painPoints: [] } });

      const data = engine.getExtractedData();
      expect(data.businessDescription).toBe('SaaS for restaurants');
      expect(data.targetAudience?.primary).toBe('Restaurant owners');
    });
  });

  describe('completion check', () => {
    it('should report isComplete when in complete phase', () => {
      const engine = createConversationEngine({ phase: 'complete' });
      expect(engine.isComplete()).toBe(true);
    });

    it('should not report isComplete when in other phases', () => {
      const engine = createConversationEngine({ phase: 'exploring' });
      expect(engine.isComplete()).toBe(false);
    });
  });

  describe('data points', () => {
    it('should track businessDescription data point', () => {
      const engine = createConversationEngine({
        extractedData: { businessDescription: 'A fintech platform for freelancers' },
      });
      const points = engine.getDataPoints();
      expect(points.hasBusinessDescription).toBe(true);
      expect(points.hasPainPoint).toBe(false);
    });

    it('should track biggestPainPoint data point', () => {
      const engine = createConversationEngine({
        extractedData: { biggestPainPoint: 'Late payments from clients are killing cash flow' },
      });
      const points = engine.getDataPoints();
      expect(points.hasBusinessDescription).toBe(false);
      expect(points.hasPainPoint).toBe(true);
    });

    it('should require minimum length for data points', () => {
      const engine = createConversationEngine({
        extractedData: { businessDescription: 'short', biggestPainPoint: 'tiny' },
      });
      const points = engine.getDataPoints();
      expect(points.hasBusinessDescription).toBe(false);
      expect(points.hasPainPoint).toBe(false);
    });
  });

  describe('phase guidance', () => {
    it('should provide welcome phase guidance about warm greeting', () => {
      const engine = createConversationEngine({ phase: 'welcome' });
      const guidance = engine.getPhaseGuidance();
      expect(guidance).toContain('warm');
    });

    it('should provide exploring guidance asking about business when no description', () => {
      const engine = createConversationEngine({ phase: 'exploring' });
      const guidance = engine.getPhaseGuidance();
      expect(guidance).toContain('building');
    });

    it('should provide exploring guidance asking about pain point when description exists', () => {
      const engine = createConversationEngine({
        phase: 'exploring',
        extractedData: { businessDescription: 'A platform for managing freelance invoicing' },
      });
      const guidance = engine.getPhaseGuidance();
      expect(guidance).toContain('challenge');
    });

    it('should provide exploring guidance to wrap up when both points collected', () => {
      const engine = createConversationEngine({
        phase: 'exploring',
        extractedData: {
          businessDescription: 'A platform for managing freelance invoicing',
          biggestPainPoint: 'Clients always pay late which kills cash flow',
        },
      });
      const guidance = engine.getPhaseGuidance();
      expect(guidance).toContain('[COMPLETE]');
    });

    it('should provide complete phase guidance about dashboard', () => {
      const engine = createConversationEngine({ phase: 'complete' });
      const guidance = engine.getPhaseGuidance();
      expect(guidance).toContain('dashboard');
    });
  });
});

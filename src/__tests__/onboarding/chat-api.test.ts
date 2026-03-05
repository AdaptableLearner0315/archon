import { describe, it, expect } from 'vitest';

describe('Onboarding Chat API Logic', () => {
  describe('marker stripping', () => {
    const stripMarkers = (text: string): string => {
      return text
        .replace(/\[COMPLETE\]/g, '')
        .replace(/\[INSIGHT:[^\]]*\]/g, '')
        .replace(/\[CREDITS:[^\]]*\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    it('should strip [COMPLETE] marker', () => {
      const text = 'Great chatting with you!\n[COMPLETE]';
      expect(stripMarkers(text)).toBe('Great chatting with you!');
    });

    it('should strip [INSIGHT] markers', () => {
      const text = 'Nice idea! [INSIGHT:marketSize=$5B] [INSIGHT:gap=Underserved market]';
      expect(stripMarkers(text)).toBe('Nice idea!');
    });

    it('should strip [CREDITS] markers', () => {
      const text = 'Welcome! [CREDITS:recommended=starter]';
      expect(stripMarkers(text)).toBe('Welcome!');
    });

    it('should strip all markers from a full response', () => {
      const text = `Let me get your team set up.

[INSIGHT:marketSize=$5.4B]
[INSIGHT:competitor=FreshBooks|billing]
[CREDITS:recommended=growth]
[COMPLETE]`;

      expect(stripMarkers(text)).toBe('Let me get your team set up.');
    });

    it('should return clean text unchanged', () => {
      const text = 'Just a regular response without any markers.';
      expect(stripMarkers(text)).toBe(text);
    });

    it('should collapse excess newlines after stripping', () => {
      const text = 'Hello!\n\n\n\n[COMPLETE]\n\n\nGoodbye!';
      expect(stripMarkers(text)).toBe('Hello!\n\nGoodbye!');
    });
  });

  describe('completion detection', () => {
    it('should detect [COMPLETE] marker', () => {
      const text = 'All set! [COMPLETE]';
      expect(text.includes('[COMPLETE]')).toBe(true);
    });

    it('should not detect completion without marker', () => {
      const text = 'Still talking...';
      expect(text.includes('[COMPLETE]')).toBe(false);
    });
  });

  describe('message count derivation', () => {
    const deriveMessageCount = (
      phase: string,
      conversationHistory: { role: string }[]
    ): number => {
      const userMessageCount = conversationHistory.filter(
        (m) => m.role === 'user'
      ).length;
      switch (phase) {
        case 'welcome':
          return userMessageCount;
        case 'personal':
          return Math.max(0, userMessageCount - 1);
        case 'business':
          return Math.max(0, userMessageCount - 3);
        case 'wrapup':
          return Math.max(0, userMessageCount - 6);
        case 'complete':
          return 0;
        default:
          return 0;
      }
    };

    it('should return user message count for welcome phase', () => {
      const history = [
        { role: 'assistant' },
        { role: 'user' },
      ];
      expect(deriveMessageCount('welcome', history)).toBe(1);
    });

    it('should return user messages minus 1 for personal phase', () => {
      const history = [
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
      ];
      expect(deriveMessageCount('personal', history)).toBe(1);
    });

    it('should return user messages minus 3 for business phase', () => {
      const history = [
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
      ];
      expect(deriveMessageCount('business', history)).toBe(2);
    });

    it('should return 0 for complete phase', () => {
      const history = [
        { role: 'user' },
        { role: 'user' },
        { role: 'user' },
      ];
      expect(deriveMessageCount('complete', history)).toBe(0);
    });

    it('should handle empty history', () => {
      expect(deriveMessageCount('welcome', [])).toBe(0);
      expect(deriveMessageCount('personal', [])).toBe(0);
      expect(deriveMessageCount('business', [])).toBe(0);
    });

    it('should not return negative for wrapup with few messages', () => {
      const history = [{ role: 'user' }];
      expect(deriveMessageCount('wrapup', history)).toBe(0);
    });
  });

  describe('forced completion logic', () => {
    const shouldForceComplete = (
      fullResponse: string,
      totalUserMessages: number,
      currentPhase: string
    ): boolean => {
      // Force complete if [COMPLETE] marker found
      if (fullResponse.includes('[COMPLETE]') && currentPhase !== 'complete') {
        return true;
      }
      // Force complete after 10+ user messages
      if (totalUserMessages >= 10 && currentPhase !== 'complete') {
        return true;
      }
      return false;
    };

    it('should force complete when [COMPLETE] marker present', () => {
      expect(shouldForceComplete('[COMPLETE]', 2, 'business')).toBe(true);
    });

    it('should force complete after 10 user messages', () => {
      expect(shouldForceComplete('No marker', 10, 'business')).toBe(true);
    });

    it('should not force complete with 9 messages and no marker', () => {
      expect(shouldForceComplete('No marker', 9, 'business')).toBe(false);
    });

    it('should not force complete with 5 messages (old threshold)', () => {
      expect(shouldForceComplete('No marker', 5, 'business')).toBe(false);
    });

    it('should not force complete if already in complete phase', () => {
      expect(shouldForceComplete('[COMPLETE]', 10, 'complete')).toBe(false);
    });
  });
});

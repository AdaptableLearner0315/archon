/**
 * Conversation Engine for Onboarding
 *
 * Simplified 3-phase flow: welcome → exploring → complete
 * Collects core data + infrastructure context for generation
 */

export type ConversationPhase = 'welcome' | 'exploring' | 'complete';

export type BusinessType = 'saas' | 'creator' | 'services' | 'ecommerce';
export type BrandTone = 'professional' | 'casual' | 'playful' | 'technical';

export interface OnboardingProfile {
  // Critical data points (required)
  businessDescription: string;
  biggestPainPoint: string;

  // Business classification (for infrastructure generation)
  businessSummary?: string;
  businessType?: BusinessType;

  // Target audience
  targetAudience?: {
    primary: string;
    painPoints?: string[];
  };

  // Competitive landscape
  competitors?: {
    name: string;
    weakness?: string;
  }[];

  // Product details
  keyFeatures?: string[];
  uniqueValueProp?: string;

  // Brand
  brandTone?: BrandTone;

  // Context
  stage?: 'idea' | 'mvp' | 'launched' | 'revenue';
  founderBackground?: string;
}

export interface ConversationState {
  phase: ConversationPhase;
  extractedData: Partial<OnboardingProfile>;
  messageCount: number;
  progress: number; // 0, 50, or 100
}

export interface DataPoints {
  hasBusinessDescription: boolean;
  hasPainPoint: boolean;
}

export class ConversationEngine {
  private state: ConversationState;

  constructor(initialState?: Partial<ConversationState>) {
    this.state = {
      phase: initialState?.phase ?? 'welcome',
      extractedData: initialState?.extractedData ?? {},
      messageCount: initialState?.messageCount ?? 0,
      progress: initialState?.progress ?? 0,
    };
  }

  getState(): ConversationState {
    return { ...this.state };
  }

  getCurrentPhase(): ConversationPhase {
    return this.state.phase;
  }

  getProgress(): number {
    return this.state.progress;
  }

  getExtractedData(): Partial<OnboardingProfile> {
    return { ...this.state.extractedData };
  }

  /**
   * Check which critical data points have been collected
   */
  getDataPoints(): DataPoints {
    const data = this.state.extractedData;
    return {
      hasBusinessDescription: Boolean(data.businessDescription && data.businessDescription.trim().length > 10),
      hasPainPoint: Boolean(data.biggestPainPoint && data.biggestPainPoint.trim().length > 10),
    };
  }

  /**
   * Calculate progress based on collected data points
   * 0% = nothing, 50% = 1 point, 100% = both points
   */
  calculateProgress(): number {
    const { hasBusinessDescription, hasPainPoint } = this.getDataPoints();

    if (hasBusinessDescription && hasPainPoint) {
      return 100;
    } else if (hasBusinessDescription || hasPainPoint) {
      return 50;
    }
    return 0;
  }

  /**
   * Process a user message and determine phase/progress
   */
  processMessage(
    extractedFields: Partial<OnboardingProfile>,
    userIndicatedDone: boolean = false
  ): {
    newPhase: ConversationPhase;
    progress: number;
    isComplete: boolean;
  } {
    this.state.messageCount++;
    this.state.extractedData = { ...this.state.extractedData, ...extractedFields };

    // Calculate progress
    const progress = this.calculateProgress();
    this.state.progress = progress;

    // Determine phase transition
    let newPhase: ConversationPhase = this.state.phase;

    // Move from welcome to exploring after first response
    if (this.state.phase === 'welcome' && this.state.messageCount >= 1) {
      newPhase = 'exploring';
    }

    // Complete when: both data points collected OR user says done OR max messages reached
    const isComplete = progress === 100 || userIndicatedDone || this.state.messageCount >= 8;

    if (isComplete) {
      newPhase = 'complete';
    }

    this.state.phase = newPhase;

    return {
      newPhase,
      progress,
      isComplete,
    };
  }

  /**
   * Get contextual prompt guidance based on current state
   */
  getPhaseGuidance(): string {
    const { hasBusinessDescription, hasPainPoint } = this.getDataPoints();
    const progress = this.state.progress;

    switch (this.state.phase) {
      case 'welcome':
        return `This is the start of the conversation. Give a warm, brief welcome and ask what they're building or working on. Be casual and friendly.`;

      case 'exploring':
        if (!hasBusinessDescription) {
          return `You're getting to know them. They haven't clearly described their business/product yet.
- Acknowledge what they shared warmly
- Ask about what they're building or working on
- Keep it natural — one question only`;
        } else if (!hasPainPoint) {
          return `Great — you know about their business. Now naturally ask about their biggest challenge or pain point.
- Reference what they told you about their business
- Ask what's their biggest struggle or challenge right now
- Keep it conversational — one question only`;
        } else {
          return `You have both critical pieces of info. Wrap up warmly and include [COMPLETE] marker.
- Summarize what you learned briefly
- Express excitement about helping them
- Include [COMPLETE] at the end`;
        }

      case 'complete':
        return `Onboarding is complete. If they say anything, warmly acknowledge and point them to the dashboard.`;

      default:
        return '';
    }
  }

  /**
   * Check if onboarding is complete
   */
  isComplete(): boolean {
    return this.state.phase === 'complete';
  }
}

export function createConversationEngine(initialState?: Partial<ConversationState>): ConversationEngine {
  return new ConversationEngine(initialState);
}

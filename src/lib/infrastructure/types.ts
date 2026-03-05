/**
 * Infrastructure Generation System Types
 *
 * Types for generating business infrastructure after onboarding.
 */

import type { AgentRole } from '@/lib/types';

// ============================================================
// Business Context Types
// ============================================================

export type BusinessType = 'saas' | 'creator' | 'services' | 'ecommerce';
export type BrandTone = 'professional' | 'casual' | 'playful' | 'technical';
export type InfrastructureAssetType = 'landing' | 'server' | 'database' | 'email' | 'social' | 'faqs';
export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type StrategicDocumentType = 'competitor_analysis' | 'growth_experiments' | 'positioning' | 'roadmap';

/**
 * Extended infrastructure context collected during onboarding
 */
export interface InfrastructureContext {
  // Core business info
  businessType: BusinessType;
  productName: string;
  tagline: string;
  businessDescription: string;

  // Target audience
  targetAudience: {
    demographics: string;
    painPoints: string[];
    desiredOutcome: string;
  };

  // Competitive landscape
  competitors: {
    name: string;
    weakness: string;
    url?: string;
  }[];

  // Product details
  keyFeatures: string[];
  uniqueValueProp: string;
  pricingModel?: 'free' | 'freemium' | 'subscription' | 'one-time' | 'custom';

  // Brand preferences
  brandTone: BrandTone;
  brandColors?: {
    primary?: string;
    secondary?: string;
  };

  // Domain & social
  preferredDomain?: string;
  socialHandles?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };

  // Stage & context
  stage: 'idea' | 'mvp' | 'launched' | 'revenue';
  hasExistingWebsite: boolean;
  hasExistingDatabase: boolean;
}

// ============================================================
// Generator Types
// ============================================================

/**
 * Result from an infrastructure generator
 */
export interface InfraResult<T = unknown> {
  success: boolean;
  type: InfrastructureAssetType;
  content: T;
  metadata: {
    generatedAt: string;
    agentsUsed: AgentRole[];
    tokensUsed: number;
    version: number;
  };
  error?: string;
}

/**
 * Status of a single generation task
 */
export interface GenerationTask {
  type: InfrastructureAssetType;
  status: GenerationStatus;
  progress: number;
  agentsWorking: AgentRole[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Overall infrastructure generation job
 */
export interface InfrastructureJob {
  id: string;
  companyId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string | null;
  tasks: GenerationTask[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Infrastructure generator interface
 */
export interface InfraGenerator<T = unknown> {
  type: InfrastructureAssetType;
  name: string;
  description: string;
  agents: AgentRole[];
  generate(context: InfrastructureContext, companyId: string): Promise<InfraResult<T>>;
}

// ============================================================
// Generated Content Types
// ============================================================

/**
 * Landing page generator output
 */
export interface LandingPageContent {
  hero: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaUrl: string;
  };
  features: {
    title: string;
    description: string;
    icon: string;
  }[];
  socialProof: {
    type: 'testimonial' | 'stat' | 'logo';
    content: string;
  }[];
  faq: {
    question: string;
    answer: string;
  }[];
  footer: {
    tagline: string;
    links: { label: string; url: string }[];
  };
  // Generated React component code
  componentCode: string;
  // Tailwind CSS classes/config
  styling: {
    colorScheme: string;
    fontPairing: string;
  };
}

/**
 * Server configuration generator output
 */
export interface ServerConfigContent {
  deploymentPlatform: 'vercel' | 'railway' | 'docker' | 'custom';
  config: {
    vercel?: Record<string, unknown>;
    docker?: {
      dockerfile: string;
      compose: string;
    };
    railway?: Record<string, unknown>;
  };
  envTemplate: string;
  healthCheck: {
    endpoint: string;
    code: string;
  };
  monitoring: {
    provider: string;
    setupInstructions: string;
  };
  security: {
    headers: Record<string, string>;
    rateLimiting: string;
    cors: string[];
  };
}

/**
 * Database schema generator output
 */
export interface DatabaseSchemaContent {
  schema: {
    tables: {
      name: string;
      columns: {
        name: string;
        type: string;
        nullable: boolean;
        default?: string;
        references?: string;
      }[];
      indexes: string[];
    }[];
    rlsPolicies: {
      table: string;
      name: string;
      operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
      definition: string;
    }[];
  };
  migrations: string[];
  seedData: string;
  backupStrategy: string;
  auditSetup: string;
}

/**
 * Email templates generator output
 */
export interface EmailTemplateContent {
  templates: {
    name: string;
    subject: string;
    htmlContent: string;
    textContent: string;
    purpose: 'welcome' | 'transactional' | 'marketing' | 'notification';
  }[];
  sequences: {
    name: string;
    trigger: string;
    emails: {
      delay: string;
      templateName: string;
    }[];
  }[];
  dnsRecords: {
    type: string;
    name: string;
    value: string;
    purpose: string;
  }[];
  deliverabilityChecklist: string[];
}

/**
 * Social media generator output
 */
export interface SocialContent {
  twitter: {
    bio: string;
    pinnedTweet: string;
    headerImagePrompt: string;
    contentCalendar: {
      day: number;
      content: string;
      type: 'thread' | 'single' | 'reply' | 'quote';
      hashtags: string[];
      bestTime: string;
    }[];
    hashtagStrategy: string[];
    competitorAccounts: string[];
    growthTactics: string[];
  };
  linkedin?: {
    bio: string;
    headline: string;
    contentIdeas: string[];
  };
}

/**
 * FAQ/Help center generator output
 */
export interface FAQContent {
  categories: {
    name: string;
    slug: string;
    description: string;
  }[];
  faqs: {
    category: string;
    question: string;
    answer: string;
    keywords: string[];
    relatedQuestions: string[];
  }[];
  searchConfig: {
    indexFields: string[];
    synonyms: Record<string, string[]>;
  };
  analyticsTracking: {
    events: string[];
    implementation: string;
  };
}

// ============================================================
// Strategic Document Types
// ============================================================

/**
 * Competitor analysis output
 */
export interface CompetitorAnalysis {
  competitors: {
    name: string;
    url: string;
    description: string;
    strengths: string[];
    weaknesses: string[];
    pricing: string;
    targetAudience: string;
    marketShare?: string;
  }[];
  positioningMatrix: {
    axes: [string, string];
    positions: {
      competitor: string;
      x: number;
      y: number;
    }[];
    yourPosition: { x: number; y: number };
  };
  gapAnalysis: {
    gap: string;
    opportunity: string;
    difficulty: 'low' | 'medium' | 'high';
  }[];
  differentiationOpportunities: string[];
  competitiveAdvantages: string[];
}

/**
 * Growth experiments output
 */
export interface GrowthExperiments {
  experiments: {
    id: string;
    name: string;
    hypothesis: string;
    category: 'acquisition' | 'activation' | 'retention' | 'revenue' | 'referral';
    testDesign: {
      control: string;
      variant: string;
      duration: string;
      sampleSize: string;
    };
    successMetrics: {
      metric: string;
      target: string;
      currentBaseline?: string;
    }[];
    implementation: string;
    priority: 'high' | 'medium' | 'low';
    estimatedImpact: string;
    effort: 'low' | 'medium' | 'high';
  }[];
  prioritizationScore: {
    experimentId: string;
    iceScore: number; // Impact * Confidence * Ease
  }[];
  roadmap: {
    week: number;
    experiments: string[];
  }[];
}

// ============================================================
// Stream Event Types
// ============================================================

export type InfraStreamEventType =
  | 'job_started'
  | 'task_started'
  | 'agent_working'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'job_completed'
  | 'job_failed';

export interface InfraStreamEvent {
  type: InfraStreamEventType;
  jobId: string;
  taskType?: InfrastructureAssetType;
  agentRole?: AgentRole;
  agentName?: string;
  progress?: number;
  message?: string;
  content?: unknown;
  error?: string;
  timestamp: string;
}

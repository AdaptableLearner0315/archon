/**
 * Infrastructure Generation Orchestrator
 *
 * Orchestrates the generation of 6 infrastructure components + strategic documents
 * after onboarding completes.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole } from '@/lib/types';
import type {
  InfrastructureContext,
  InfrastructureJob,
  InfrastructureAssetType,
  GenerationTask,
  InfraResult,
  InfraStreamEvent,
  StrategicDocumentType,
} from './types';

// Import individual generators
import { generateLandingPage } from './generators/landing';
import { generateServerConfig } from './generators/server';
import { generateDatabaseSchema } from './generators/database';
import { generateEmailTemplates } from './generators/email';
import { generateSocialContent } from './generators/social';
import { generateFAQContent } from './generators/faqs';
import { generateCompetitorAnalysis, generateGrowthExperiments } from './generators/strategic';
import { provisionEmailDomain } from '@/lib/resend/domain-provisioning';
import { getValidTokens } from '@/lib/provisioning/tokens';
import { deployLandingPage } from '@/lib/provisioning/deployers/landing-deployer';
import type { LandingPageContent } from './types';

// ============================================================
// Configuration
// ============================================================

const INFRASTRUCTURE_TYPES: InfrastructureAssetType[] = [
  'landing',
  'server',
  'database',
  'email',
  'social',
  'faqs',
];

const STRATEGIC_TYPES: StrategicDocumentType[] = [
  'competitor_analysis',
  'growth_experiments',
];

// ============================================================
// Main Orchestrator
// ============================================================

export interface GeneratorOptions {
  supabase: SupabaseClient;
  companyId: string;
  context: InfrastructureContext;
  onProgress?: (event: InfraStreamEvent) => void;
}

/**
 * Generate all infrastructure for a company
 */
export async function generateInfrastructure(options: GeneratorOptions): Promise<InfrastructureJob> {
  const { supabase, companyId, context, onProgress } = options;

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from('infrastructure_jobs')
    .insert({
      company_id: companyId,
      status: 'running',
      progress: 0,
      current_step: 'Initializing infrastructure generation...',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(`Failed to create infrastructure job: ${jobError.message}`);
  }

  const jobId = job.id;
  const tasks: GenerationTask[] = INFRASTRUCTURE_TYPES.map((type) => ({
    type,
    status: 'pending',
    progress: 0,
    agentsWorking: [],
  }));

  // Emit job started event
  emitEvent(onProgress, {
    type: 'job_started',
    jobId,
    message: 'Starting infrastructure generation...',
    timestamp: new Date().toISOString(),
  });

  try {
    // Generate all infrastructure components in parallel
    const results = await Promise.allSettled(
      INFRASTRUCTURE_TYPES.map(async (type, index) => {
        const task = tasks[index];

        // Update task status to generating
        task.status = 'generating';

        emitEvent(onProgress, {
          type: 'task_started',
          jobId,
          taskType: type,
          message: `Generating ${type} infrastructure...`,
          timestamp: new Date().toISOString(),
        });

        // Call the appropriate generator
        const result = await callGenerator(type, context, companyId, (agent, progress) => {
          task.agentsWorking = agent ? [agent as AgentRole] : [];
          task.progress = progress;

          emitEvent(onProgress, {
            type: 'task_progress',
            jobId,
            taskType: type,
            agentRole: agent as AgentRole | undefined,
            progress,
            timestamp: new Date().toISOString(),
          });
        });

        // Store the result in the database
        await supabase
          .from('infrastructure_assets')
          .upsert({
            company_id: companyId,
            type,
            status: result.success ? 'completed' : 'failed',
            content: result.content,
            metadata: result.metadata,
            error: result.error || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'company_id,type',
          });

        // Update task status
        task.status = result.success ? 'completed' : 'failed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        if (!result.success) {
          task.error = result.error;
        }

        emitEvent(onProgress, {
          type: result.success ? 'task_completed' : 'task_failed',
          jobId,
          taskType: type,
          error: result.error,
          timestamp: new Date().toISOString(),
        });

        // Update job progress
        const completedCount = tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length;
        const progress = Math.round((completedCount / INFRASTRUCTURE_TYPES.length) * 80); // 80% for infra, 20% for strategic

        await supabase
          .from('infrastructure_jobs')
          .update({
            progress,
            current_step: `Generated ${completedCount}/${INFRASTRUCTURE_TYPES.length} components`,
          })
          .eq('id', jobId);

        return result;
      })
    );

    // Generate strategic documents (competitor analysis + growth experiments)
    await generateStrategicDocuments(supabase, companyId, context, jobId, onProgress);

    // Post-generation: Email provisioning via Resend (non-blocking)
    try {
      // Get company slug for domain provisioning
      const { data: companyData } = await supabase
        .from('companies')
        .select('slug')
        .eq('id', companyId)
        .single();

      if (companyData?.slug) {
        emitEvent(onProgress, {
          type: 'task_started',
          jobId,
          message: 'Provisioning email domain...',
          timestamp: new Date().toISOString(),
        });

        const emailResult = await provisionEmailDomain(companyData.slug);
        if (emailResult.success && emailResult.email) {
          // Store provisioned email in the email infrastructure asset metadata
          await supabase
            .from('infrastructure_assets')
            .update({
              metadata: {
                provisionedEmail: emailResult.email,
                domainId: emailResult.domainId,
                domain: emailResult.domain,
              },
            })
            .eq('company_id', companyId)
            .eq('type', 'email');
        }
      }
    } catch (emailProvError) {
      console.error('Email provisioning failed (non-blocking):', emailProvError);
    }

    // Post-generation: Auto-deploy landing page to Vercel (non-blocking)
    try {
      const tokens = await getValidTokens(companyId, 'vercel');
      if (tokens) {
        // Get the generated landing page content
        const { data: landingAsset } = await supabase
          .from('infrastructure_assets')
          .select('content')
          .eq('company_id', companyId)
          .eq('type', 'landing')
          .single();

        if (landingAsset?.content) {
          emitEvent(onProgress, {
            type: 'task_started',
            jobId,
            message: 'Deploying to Vercel...',
            timestamp: new Date().toISOString(),
          });

          const { data: companyForDeploy } = await supabase
            .from('companies')
            .select('slug')
            .eq('id', companyId)
            .single();

          const projectName = companyForDeploy?.slug || `archon-${companyId.slice(0, 8)}`;

          await deployLandingPage(
            companyId,
            landingAsset.content as LandingPageContent,
            projectName,
            (progress) => {
              emitEvent(onProgress, {
                type: 'task_progress',
                jobId,
                message: progress.message,
                progress: progress.progress,
                timestamp: new Date().toISOString(),
              });
            }
          );
        }
      }
    } catch (deployError) {
      console.error('Auto-deploy failed (non-blocking):', deployError);
    }

    // Calculate final status
    const failedTasks = tasks.filter((t) => t.status === 'failed');
    const finalStatus = failedTasks.length === 0 ? 'completed' : failedTasks.length === tasks.length ? 'failed' : 'completed';

    // Update job to completed
    await supabase
      .from('infrastructure_jobs')
      .update({
        status: finalStatus,
        progress: 100,
        current_step: 'Infrastructure generation complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    emitEvent(onProgress, {
      type: 'job_completed',
      jobId,
      progress: 100,
      message: 'Infrastructure generation complete!',
      timestamp: new Date().toISOString(),
    });

    return {
      id: jobId,
      companyId,
      status: finalStatus,
      progress: 100,
      currentStep: 'Infrastructure generation complete',
      tasks,
      startedAt: job.started_at,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Update job to failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('infrastructure_jobs')
      .update({
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    emitEvent(onProgress, {
      type: 'job_failed',
      jobId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}

/**
 * Generate strategic documents (competitor analysis + growth experiments)
 */
async function generateStrategicDocuments(
  supabase: SupabaseClient,
  companyId: string,
  context: InfrastructureContext,
  jobId: string,
  onProgress?: (event: InfraStreamEvent) => void
): Promise<void> {
  // Update job progress
  await supabase
    .from('infrastructure_jobs')
    .update({
      progress: 85,
      current_step: 'Generating strategic documents...',
    })
    .eq('id', jobId);

  // Generate competitor analysis
  try {
    emitEvent(onProgress, {
      type: 'task_started',
      jobId,
      message: 'Generating competitor analysis...',
      timestamp: new Date().toISOString(),
    });

    const competitorAnalysis = await generateCompetitorAnalysis(context, companyId);

    await supabase
      .from('strategic_documents')
      .upsert({
        company_id: companyId,
        type: 'competitor_analysis',
        content: competitorAnalysis.content,
        metadata: competitorAnalysis.metadata,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'company_id,type',
      });
  } catch (error) {
    console.error('Failed to generate competitor analysis:', error);
  }

  // Update progress
  await supabase
    .from('infrastructure_jobs')
    .update({
      progress: 92,
      current_step: 'Generating growth experiments...',
    })
    .eq('id', jobId);

  // Generate growth experiments
  try {
    emitEvent(onProgress, {
      type: 'task_started',
      jobId,
      message: 'Generating growth experiments...',
      timestamp: new Date().toISOString(),
    });

    const growthExperiments = await generateGrowthExperiments(context, companyId);

    await supabase
      .from('strategic_documents')
      .upsert({
        company_id: companyId,
        type: 'growth_experiments',
        content: growthExperiments.content,
        metadata: growthExperiments.metadata,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'company_id,type',
      });
  } catch (error) {
    console.error('Failed to generate growth experiments:', error);
  }
}

/**
 * Call the appropriate generator based on type
 */
async function callGenerator(
  type: InfrastructureAssetType,
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult> {
  switch (type) {
    case 'landing':
      return generateLandingPage(context, companyId, onProgress);
    case 'server':
      return generateServerConfig(context, companyId, onProgress);
    case 'database':
      return generateDatabaseSchema(context, companyId, onProgress);
    case 'email':
      return generateEmailTemplates(context, companyId, onProgress);
    case 'social':
      return generateSocialContent(context, companyId, onProgress);
    case 'faqs':
      return generateFAQContent(context, companyId, onProgress);
    default:
      throw new Error(`Unknown generator type: ${type}`);
  }
}

/**
 * Emit a progress event if callback is provided
 */
function emitEvent(
  onProgress: ((event: InfraStreamEvent) => void) | undefined,
  event: InfraStreamEvent
): void {
  if (onProgress) {
    onProgress(event);
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get infrastructure generation status for a company
 */
export async function getInfrastructureStatus(
  supabase: SupabaseClient,
  companyId: string
): Promise<{
  job: InfrastructureJob | null;
  assets: Record<InfrastructureAssetType, { status: string; content: unknown } | null>;
}> {
  // Get latest job
  const { data: jobs } = await supabase
    .from('infrastructure_jobs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1);

  const job = jobs?.[0] || null;

  // Get all assets
  const { data: assetsData } = await supabase
    .from('infrastructure_assets')
    .select('*')
    .eq('company_id', companyId);

  const assets: Record<InfrastructureAssetType, { status: string; content: unknown } | null> = {
    landing: null,
    server: null,
    database: null,
    email: null,
    social: null,
    faqs: null,
  };

  if (assetsData) {
    for (const asset of assetsData) {
      assets[asset.type as InfrastructureAssetType] = {
        status: asset.status,
        content: asset.content,
      };
    }
  }

  return {
    job: job ? {
      id: job.id,
      companyId: job.company_id,
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step,
      tasks: [],
      startedAt: job.started_at,
      completedAt: job.completed_at,
      error: job.error,
    } : null,
    assets,
  };
}

/**
 * Regenerate a specific infrastructure component
 */
export async function regenerateInfrastructureAsset(
  supabase: SupabaseClient,
  companyId: string,
  type: InfrastructureAssetType,
  context: InfrastructureContext,
  onProgress?: (event: InfraStreamEvent) => void
): Promise<InfraResult> {
  // Mark asset as regenerating
  await supabase
    .from('infrastructure_assets')
    .update({
      status: 'generating',
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('type', type);

  // Generate new content
  const result = await callGenerator(type, context, companyId, (agent, progress) => {
    if (onProgress) {
      emitEvent(onProgress, {
        type: 'task_progress',
        jobId: 'regenerate',
        taskType: type,
        agentRole: agent as AgentRole | undefined,
        progress,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Update asset with new content
  await supabase
    .from('infrastructure_assets')
    .update({
      status: result.success ? 'completed' : 'failed',
      content: result.content,
      metadata: {
        ...result.metadata,
        regeneratedAt: new Date().toISOString(),
      },
      error: result.error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('type', type);

  return result;
}

/**
 * Extract infrastructure context from onboarding profile
 */
export function extractInfrastructureContext(
  profile: Record<string, unknown>,
  conversationHistory: { role: string; content: string }[]
): InfrastructureContext {
  // Determine business type from profile
  const businessIdea = (profile.business_idea as string) || '';
  const lowerIdea = businessIdea.toLowerCase();

  let businessType: InfrastructureContext['businessType'] = 'saas';
  if (lowerIdea.includes('content') || lowerIdea.includes('creator') || lowerIdea.includes('course') || lowerIdea.includes('newsletter')) {
    businessType = 'creator';
  } else if (lowerIdea.includes('agency') || lowerIdea.includes('consulting') || lowerIdea.includes('freelance') || lowerIdea.includes('service')) {
    businessType = 'services';
  } else if (lowerIdea.includes('shop') || lowerIdea.includes('store') || lowerIdea.includes('product') || lowerIdea.includes('ecommerce')) {
    businessType = 'ecommerce';
  }

  // Extract target audience
  const targetAudience = profile.target_audience as { primary?: string; painPoints?: string[] } | undefined;

  // Extract competitors
  const competitors = (profile.competitors as { name: string; strengths?: string[]; weaknesses?: string[] }[]) || [];

  return {
    businessType,
    productName: (profile.business_idea_summary as string) || 'My Product',
    tagline: extractTagline(businessIdea),
    businessDescription: businessIdea,
    targetAudience: {
      demographics: targetAudience?.primary || 'General audience',
      painPoints: targetAudience?.painPoints || [],
      desiredOutcome: extractDesiredOutcome(conversationHistory),
    },
    competitors: competitors.map((c) => ({
      name: c.name,
      weakness: c.weaknesses?.[0] || 'Unknown',
      url: undefined,
    })),
    keyFeatures: extractKeyFeatures(businessIdea),
    uniqueValueProp: (profile.unique_value_prop as string) || 'Better solution for your needs',
    pricingModel: 'subscription',
    brandTone: determineBrandTone(businessIdea),
    stage: (profile.stage as InfrastructureContext['stage']) || 'idea',
    hasExistingWebsite: false,
    hasExistingDatabase: false,
  };
}

// Helper functions for context extraction
function extractTagline(businessIdea: string): string {
  // Extract a short tagline from the business idea
  const sentences = businessIdea.split(/[.!?]+/);
  if (sentences[0] && sentences[0].length <= 60) {
    return sentences[0].trim();
  }
  return businessIdea.substring(0, 50).trim() + '...';
}

function extractDesiredOutcome(conversation: { role: string; content: string }[]): string {
  // Look for outcome-related content in conversation
  const userMessages = conversation
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');

  if (userMessages.includes('save time')) return 'Save time and increase efficiency';
  if (userMessages.includes('make money') || userMessages.includes('revenue')) return 'Generate more revenue';
  if (userMessages.includes('grow')) return 'Scale their business';
  return 'Achieve their goals more easily';
}

function extractKeyFeatures(businessIdea: string): string[] {
  // Extract potential features from business idea
  const features: string[] = [];
  const idea = businessIdea.toLowerCase();

  if (idea.includes('automat')) features.push('Automation');
  if (idea.includes('ai') || idea.includes('intelligent')) features.push('AI-Powered');
  if (idea.includes('analytic') || idea.includes('insight')) features.push('Analytics & Insights');
  if (idea.includes('collaborat') || idea.includes('team')) features.push('Team Collaboration');
  if (idea.includes('integrat')) features.push('Integrations');
  if (idea.includes('custom')) features.push('Customization');

  if (features.length === 0) {
    features.push('Easy to use', 'Time-saving', 'Reliable');
  }

  return features.slice(0, 6);
}

function determineBrandTone(businessIdea: string): InfrastructureContext['brandTone'] {
  const idea = businessIdea.toLowerCase();

  if (idea.includes('enterprise') || idea.includes('b2b') || idea.includes('professional')) {
    return 'professional';
  }
  if (idea.includes('fun') || idea.includes('game') || idea.includes('social')) {
    return 'playful';
  }
  if (idea.includes('developer') || idea.includes('api') || idea.includes('technical')) {
    return 'technical';
  }
  return 'casual';
}

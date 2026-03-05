import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deployLandingPage, type DeploymentProgress } from '@/lib/provisioning';
import type { LandingPageContent } from '@/lib/infrastructure/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/provision/deploy
 * Deploy infrastructure assets to connected services
 * Streams progress via SSE
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Authenticate
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          sendEvent('error', { error: 'Unauthorized' });
          controller.close();
          return;
        }

        // Parse request
        const body = await request.json();
        const { companyId, assetType, projectName } = body;

        if (!companyId || !assetType) {
          sendEvent('error', { error: 'Missing companyId or assetType' });
          controller.close();
          return;
        }

        // Verify company ownership
        const { data: company } = await supabase
          .from('companies')
          .select('id, name')
          .eq('id', companyId)
          .eq('user_id', user.id)
          .single();

        if (!company) {
          sendEvent('error', { error: 'Company not found' });
          controller.close();
          return;
        }

        // Create provision job
        const { data: job, error: jobError } = await supabase
          .from('provision_jobs')
          .insert({
            company_id: companyId,
            type: 'landing_deploy',
            status: 'running',
            progress: 0,
            current_step: 'Starting deployment',
          })
          .select()
          .single();

        if (jobError || !job) {
          sendEvent('error', { error: 'Failed to create provision job' });
          controller.close();
          return;
        }

        sendEvent('job_started', { jobId: job.id });

        // Handle different asset types
        if (assetType === 'landing') {
          // Get the landing page content
          const { data: asset } = await supabase
            .from('infrastructure_assets')
            .select('content')
            .eq('company_id', companyId)
            .eq('type', 'landing')
            .single();

          if (!asset?.content) {
            sendEvent('error', { error: 'No landing page content found. Generate infrastructure first.' });
            await updateJobStatus(supabase, job.id, 'failed', 'No content found');
            controller.close();
            return;
          }

          const content = asset.content as LandingPageContent;
          const name = projectName || generateProjectName(company.name);
          const customDomain = process.env.ARCHON_LANDING_DOMAIN;

          // Deploy with progress streaming
          const result = await deployLandingPage(
            companyId,
            content,
            name,
            (progress: DeploymentProgress) => {
              sendEvent('progress', {
                jobId: job.id,
                ...progress,
              });

              // Update job in database
              updateJobProgress(supabase, job.id, progress);
            },
            customDomain
          );

          if (result.success) {
            await updateJobStatus(supabase, job.id, 'completed', null, {
              url: result.url,
              vercelUrl: result.vercelUrl,
              deploymentId: result.deploymentId,
            });

            sendEvent('completed', {
              jobId: job.id,
              url: result.url,
              vercelUrl: result.vercelUrl,
              deploymentId: result.deploymentId,
            });
          } else {
            await updateJobStatus(supabase, job.id, 'failed', result.error);
            sendEvent('error', {
              jobId: job.id,
              error: result.error,
            });
          }
        } else {
          sendEvent('error', { error: `Deployment not supported for asset type: ${assetType}` });
          await updateJobStatus(supabase, job.id, 'failed', 'Unsupported asset type');
        }

        controller.close();
      } catch (error) {
        console.error('Deploy error:', error);
        sendEvent('error', {
          error: error instanceof Error ? error.message : 'Deployment failed',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function generateProjectName(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${slug}-landing`;
}

async function updateJobProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  progress: DeploymentProgress
) {
  await supabase
    .from('provision_jobs')
    .update({
      progress: progress.progress,
      current_step: progress.message,
    })
    .eq('id', jobId);
}

async function updateJobStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  status: 'completed' | 'failed',
  error?: string | null,
  result?: Record<string, unknown>
) {
  await supabase
    .from('provision_jobs')
    .update({
      status,
      progress: status === 'completed' ? 100 : 0,
      error: error || null,
      result: result || {},
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

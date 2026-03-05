'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import { AGENTS } from '@/lib/types';
import ActivityHero from '@/components/dashboard/ActivityHero';
import MetricsRow from '@/components/dashboard/MetricsRow';
import AgentOrbit from '@/components/dashboard/AgentOrbit';
import NeuralStream from '@/components/dashboard/NeuralStream';
import WinsCarousel from '@/components/dashboard/WinsCarousel';
import PriorityCards from '@/components/dashboard/PriorityCards';
import LiveFeed from '@/components/dashboard/LiveFeed';
import CommandCenter from '@/components/command-center/CommandCenter';
import DashboardNav from '@/components/dashboard/DashboardNav';
import { ProfileIncompleteNotification } from '@/components/dashboard/ProfileIncompleteNotification';
import { InfrastructureBuildingStatus } from '@/components/dashboard/InfrastructureBuildingStatus';
import { Celebration } from '@/components/ui/Celebration';
import { useMilestones } from '@/lib/hooks/useMilestones';

interface InfrastructureData {
  landingPageUrl?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { setCompanyId, addActivity, setMetrics } = useAppStore();
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [infraData, setInfraData] = useState<InfrastructureData>({});
  const [needsInfraGeneration, setNeedsInfraGeneration] = useState(false);
  const {
    checkMilestone,
    markMilestone,
    shouldCelebrate,
    pendingCelebration,
    clearCelebration,
  } = useMilestones(company?.id as string | undefined);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const loadCompany = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // No company — dashboard layout already redirects server-side
        if (!data) {
          setIsLoading(false);
          return;
        }

        if (data) {
          setCompany(data);
          setCompanyId(data.id);

          // Load recent activities
          const { data: activities } = await supabase
            .from('agent_activities')
            .select('*')
            .eq('company_id', data.id)
            .order('created_at', { ascending: false })
            .limit(20);

          if (activities) {
            activities.reverse().forEach((a) =>
              addActivity({
                agentRole: a.agent_role,
                agentName: a.agent_name,
                action: a.action,
                detail: a.detail,
                type: a.type,
              })
            );
          }

          // Load metrics
          const { data: metricsData } = await supabase
            .from('metrics')
            .select('*')
            .eq('company_id', data.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (metricsData) {
            setMetrics([
              {
                label: 'Revenue',
                value: `$${Number(metricsData.revenue).toLocaleString()}`,
                change: 0,
                trend: 'neutral',
              },
              {
                label: 'Users',
                value: metricsData.users_count.toLocaleString(),
                change: 0,
                trend: 'neutral',
              },
              {
                label: 'Signups Today',
                value: metricsData.signups_today.toString(),
                change: 0,
                trend: 'neutral',
              },
              {
                label: 'Conversion',
                value: `${metricsData.conversion_rate}%`,
                change: 0,
                trend: 'neutral',
              },
            ]);
          }

          // Load infrastructure assets (landing URL, social links)
          const { data: infraAssets } = await supabase
            .from('infrastructure_assets')
            .select('type, content, metadata')
            .eq('company_id', data.id)
            .in('type', ['landing', 'social']);

          if (infraAssets && infraAssets.length > 0) {
            const landingAsset = infraAssets.find((a) => a.type === 'landing');
            const socialAsset = infraAssets.find((a) => a.type === 'social');

            const infraDataUpdate: InfrastructureData = {};

            // Get deployed URL from landing asset metadata
            if (landingAsset?.metadata && typeof landingAsset.metadata === 'object') {
              const metadata = landingAsset.metadata as Record<string, unknown>;
              if (metadata.deployedUrl) {
                infraDataUpdate.landingPageUrl = metadata.deployedUrl as string;
              }
            }

            // Get social links from social asset content
            if (socialAsset?.content && typeof socialAsset.content === 'object') {
              const content = socialAsset.content as Record<string, unknown>;
              infraDataUpdate.socialLinks = {};
              if (content.twitter && typeof content.twitter === 'object') {
                const twitter = content.twitter as Record<string, unknown>;
                if (twitter.handle) {
                  infraDataUpdate.socialLinks.twitter = `https://twitter.com/${(twitter.handle as string).replace('@', '')}`;
                }
              }
              if (content.linkedin && typeof content.linkedin === 'object') {
                const linkedin = content.linkedin as Record<string, unknown>;
                if (linkedin.url) {
                  infraDataUpdate.socialLinks.linkedin = linkedin.url as string;
                }
              }
            }

            setInfraData(infraDataUpdate);
          } else {
            // No infrastructure exists — check if there's an onboarding profile to generate from
            // and no running/completed job
            const { data: jobs } = await supabase
              .from('infrastructure_jobs')
              .select('id, status')
              .eq('company_id', data.id)
              .order('created_at', { ascending: false })
              .limit(1);

            const latestJob = jobs?.[0];
            const hasRunningJob = latestJob?.status === 'running';
            const hasCompletedJob = latestJob?.status === 'completed';

            if (!hasRunningJob && !hasCompletedJob) {
              // Check if onboarding profile exists (needed for generation)
              const { data: profile } = await supabase
                .from('onboarding_profiles')
                .select('id')
                .eq('company_id', data.id)
                .limit(1);

              if (profile && profile.length > 0) {
                setNeedsInfraGeneration(true);
              }
            }
          }

          setIsLoading(false);
        }
      } catch {
        // Auth is broken (406, stale cookies, network error)
        // Sign out to clear stale cookies and redirect to login
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/auth/login');
      }
    };

    loadCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger first dashboard visit celebration
  useEffect(() => {
    if (!company) return;

    // Small delay to let the page render first
    const timer = setTimeout(() => {
      if (!checkMilestone('first_dashboard_visit')) {
        markMilestone('first_dashboard_visit', {
          celebrate: true,
          title: 'Welcome to your dashboard!',
          subtitle: 'Your AI organization is ready to work',
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [company, checkMilestone, markMilestone]);

  // Simulate agent activity on first load
  useEffect(() => {
    if (!company) return;

    const timeout = setTimeout(() => {
      const initialActions = [
        { role: 'ceo' as const, name: 'Atlas', action: 'Analyzing business context', detail: `Setting strategic priorities for "${company.name}"`, type: 'action' as const },
        { role: 'data-analyst' as const, name: 'Lens', action: 'Running competitive scan', detail: 'Identifying top 5 competitors and their pricing models', type: 'action' as const },
        { role: 'marketing' as const, name: 'Echo', action: 'Drafting brand positioning', detail: 'Creating initial messaging framework and content calendar', type: 'action' as const },
        { role: 'engineer' as const, name: 'Forge', action: 'Initializing tech stack', detail: 'Setting up repository, CI/CD pipeline, and deployment configuration', type: 'action' as const },
        { role: 'growth' as const, name: 'Pulse', action: 'Mapping acquisition channels', detail: 'Evaluating Reddit, Twitter, ProductHunt, and SEO as primary channels', type: 'action' as const },
      ];

      initialActions.forEach((action, i) => {
        setTimeout(() => {
          addActivity({
            agentRole: action.role,
            agentName: action.name,
            action: action.action,
            detail: action.detail,
            type: action.type,
          });
          useAppStore.getState().updateAgentStatus(action.role, 'working', action.action);
        }, i * 2000);
      });

      // Mark agents as completed after a delay
      setTimeout(() => {
        initialActions.forEach((action) => {
          useAppStore.getState().updateAgentStatus(action.role, 'completed', action.action);
        });
        addActivity({
          agentRole: 'ceo',
          agentName: 'Atlas',
          action: 'Initial analysis complete',
          detail: 'All agents have completed first-pass analysis. Strategy brief ready for review.',
          type: 'milestone',
        });
      }, initialActions.length * 2000 + 3000);
    }, 1500);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  if (isLoading || !company) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading your AI organization...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Milestone celebration overlay */}
      <Celebration
        active={shouldCelebrate}
        type={pendingCelebration?.type ?? 'custom'}
        title={pendingCelebration?.title}
        subtitle={pendingCelebration?.subtitle}
        onComplete={clearCelebration}
      />

      <DashboardNav
        companyName={company.name as string}
        companySlug={company.slug as string}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex pt-14">
        {/* Main Dashboard */}
        <main className={`flex-1 p-6 transition-all ${sidebarOpen ? 'mr-[420px]' : ''}`}>
          <ProfileIncompleteNotification companyId={company.id as string} />

          {/* Auto-build infrastructure if needed */}
          {needsInfraGeneration && (
            <InfrastructureBuildingStatus
              companyId={company.id as string}
              onComplete={() => {
                setNeedsInfraGeneration(false);
                // Reload the page to pick up fresh infra data
                window.location.reload();
              }}
            />
          )}

          {/* Hero Section: Activity Summary */}
          <ActivityHero
            companySlug={company.slug as string}
            landingPageUrl={infraData.landingPageUrl}
            socialLinks={infraData.socialLinks}
          />

          {/* Compact Metrics Row */}
          <div className="mt-6">
            <MetricsRow />
          </div>

          {/* Priority Items + Mission Control */}
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <PriorityCards />
            {/* Mission Control: Neural Stream + Agent Orbit */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Mission Control
                </h2>
              </div>
              <div className="flex gap-4">
                <NeuralStream className="flex-1 min-w-0" />
                <div className="shrink-0">
                  <AgentOrbit compact />
                </div>
              </div>
            </div>
          </div>

          {/* This Week's Wins */}
          <div className="mt-6">
            <WinsCarousel />
          </div>

          {/* Live Activity Feed */}
          <div className="mt-6">
            <LiveFeed />
          </div>
        </main>

        {/* Command Center Sidebar */}
        {sidebarOpen && (
          <CommandCenter companyId={company.id as string} companyName={company.name as string} />
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import { AGENTS } from '@/lib/types';
import KPICards from '@/components/dashboard/KPICards';
import AgentPanel from '@/components/dashboard/AgentPanel';
import LiveFeed from '@/components/dashboard/LiveFeed';
import WeeklyRetro from '@/components/dashboard/WeeklyRetro';
import CommandCenter from '@/components/command-center/CommandCenter';
import DashboardNav from '@/components/dashboard/DashboardNav';

export default function DashboardPage() {
  const { setCompanyId, addActivity, setMetrics } = useAppStore();
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const loadCompany = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .single();

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
      }
    };

    loadCompany();
  }, [setCompanyId, addActivity, setMetrics]);

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

  if (!company) {
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
      <DashboardNav
        companyName={company.name as string}
        companySlug={company.slug as string}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex pt-14">
        {/* Main Dashboard */}
        <main className={`flex-1 p-6 transition-all ${sidebarOpen ? 'mr-[420px]' : ''}`}>
          <KPICards />

          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <AgentPanel />
            <LiveFeed />
          </div>

          <div className="mt-6">
            <WeeklyRetro companyId={company.id as string} />
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

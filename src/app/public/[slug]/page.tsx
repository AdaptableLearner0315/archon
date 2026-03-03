import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Zap, Activity, TrendingUp, Users, DollarSign, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from('companies')
    .select('name, description')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (!company) return { title: 'Not Found' };

  return {
    title: `${company.name} — Powered by Archon`,
    description: company.description,
    openGraph: {
      title: `${company.name} — AI-Powered Company`,
      description: `${company.description} — Built and run autonomously by Archon AI`,
    },
  };
}

export default async function PublicDashboard({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (!company) notFound();

  // Load metrics
  const { data: metrics } = await supabase
    .from('metrics')
    .select('*')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Load recent activities
  const { data: activities } = await supabase
    .from('agent_activities')
    .select('*')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(15);

  // Load latest retro
  const { data: retro } = await supabase
    .from('weekly_retros')
    .select('*')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa]">
      {/* Nav */}
      <nav className="border-b border-[#27272a]/50 bg-[#09090b]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#6d28d9] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-[#a1a1aa]">Powered by</span>
            <span className="font-bold text-sm">Archon</span>
          </div>
          <Link
            href="/"
            className="px-4 py-1.5 bg-[#6d28d9] hover:bg-[#7c3aed] text-white rounded-lg text-sm font-medium transition"
          >
            Build Your Own AI Company
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Company Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{company.name}</h1>
          <p className="text-[#a1a1aa]">{company.description}</p>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#6d28d9]/10 text-[#a78bfa] border border-[#6d28d9]/20">
              Goal: {company.goal}
            </span>
            <span className="text-xs text-[#a1a1aa]">
              Running since {new Date(company.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Revenue', value: `$${Number(metrics?.revenue || 0).toLocaleString()}`, icon: DollarSign },
            { label: 'Users', value: (metrics?.users_count || 0).toLocaleString(), icon: Users },
            { label: 'Signups Today', value: (metrics?.signups_today || 0).toString(), icon: TrendingUp },
            { label: 'Conversion', value: `${metrics?.conversion_rate || 0}%`, icon: BarChart3 },
          ].map((m) => (
            <div key={m.label} className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="w-4 h-4 text-[#a1a1aa]" />
                <p className="text-sm text-[#a1a1aa]">{m.label}</p>
              </div>
              <p className="text-2xl font-bold">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Activity Feed */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-[#6d28d9]" />
            <h2 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider">
              Agent Activity
            </h2>
          </div>

          <div className="space-y-1">
            {(!activities || activities.length === 0) ? (
              <p className="text-sm text-[#a1a1aa] py-8 text-center">No activity yet</p>
            ) : (
              activities.map((a) => (
                <div
                  key={a.id}
                  className="flex gap-3 py-2.5 px-3 rounded-lg hover:bg-[#27272a]/30 transition"
                >
                  <span className="text-xs text-[#a1a1aa] font-mono w-12 flex-shrink-0 pt-0.5">
                    {formatTime(a.created_at)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#a78bfa]">{a.agent_name}</span>
                      <span className="text-sm font-medium">{a.action}</span>
                    </div>
                    {a.detail && (
                      <p className="text-xs text-[#a1a1aa] mt-0.5">{a.detail}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Retro */}
        {retro && (
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 mb-8">
            <h2 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
              Weekly Retrospective
            </h2>
            <p className="text-sm leading-relaxed">{retro.summary}</p>
            {retro.top_insight && (
              <p className="text-sm text-[#a78bfa] mt-3 italic">&ldquo;{retro.top_insight}&rdquo;</p>
            )}
          </div>
        )}

        {/* Footer attribution */}
        <div className="text-center py-8 border-t border-[#27272a]">
          <p className="text-sm text-[#a1a1aa]">
            This company is built and run autonomously by{' '}
            <Link href="/" className="text-[#a78bfa] hover:underline font-medium">
              Archon
            </Link>{' '}
            — The 1-Person Unicorn Engine
          </p>
        </div>
      </main>
    </div>
  );
}

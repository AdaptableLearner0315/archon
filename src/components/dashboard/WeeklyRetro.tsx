'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Brain, TrendingUp, Sparkles } from 'lucide-react';

interface WeeklyRetroProps {
  companyId: string;
}

interface Retro {
  id: string;
  summary: string;
  top_insight: string;
  created_at: string;
}

export default function WeeklyRetro({ companyId }: WeeklyRetroProps) {
  const [retro, setRetro] = useState<Retro | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('weekly_retros')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) setRetro(data);
    };
    load();
  }, [companyId]);

  // Show a placeholder if no retro yet
  const displayRetro = retro || {
    summary: 'Your first weekly retrospective will be generated after 7 days of operation. Your AI organization is currently gathering data and establishing baselines.',
    top_insight: 'Agents are calibrating to your business context. The self-evolution engine will activate after enough data is collected.',
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Weekly Retrospective
        </h2>
        {retro && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium ml-auto">
            Self-Evolution Engine
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-secondary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase">Summary</p>
          </div>
          <p className="text-sm leading-relaxed">{displayRetro.summary}</p>
        </div>
        <div className="bg-secondary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <p className="text-xs font-semibold text-muted-foreground uppercase">Top Insight</p>
          </div>
          <p className="text-sm leading-relaxed">{displayRetro.top_insight}</p>
        </div>
      </div>
    </div>
  );
}

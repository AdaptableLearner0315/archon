'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import {
  Zap,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Users,
  Rocket,
  Palette,
  Loader2,
  Target,
  Brain,
  BarChart3,
  TrendingUp,
} from 'lucide-react';

const GOALS = [
  { value: 'revenue', label: 'Generate Revenue', icon: DollarSign, desc: 'Monetize fast, optimize pricing, drive sales' },
  { value: 'users', label: 'Grow User Base', icon: Users, desc: 'Acquire users, build community, viral loops' },
  { value: 'launch', label: 'Launch Product', icon: Rocket, desc: 'Ship MVP, validate idea, get first customers' },
  { value: 'brand', label: 'Build Brand', icon: Palette, desc: 'Content strategy, thought leadership, authority' },
] as const;

const BUDGETS = [
  { value: '$0', label: '$0 / month', desc: 'Organic only' },
  { value: '$100', label: '$100 / month', desc: 'Testing channels' },
  { value: '$500', label: '$500 / month', desc: 'Scaling what works' },
  { value: '$1000+', label: '$1,000+ / month', desc: 'Full throttle' },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [idea, setIdea] = useState('');
  const [goal, setGoal] = useState<string>('');
  const [budget, setBudget] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/auth/login');
      return;
    }

    // Generate slug from idea
    const slug = idea
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 8);

    const { data: company, error } = await supabase
      .from('companies')
      .insert({
        user_id: user.id,
        name: idea,
        slug,
        description: idea,
        goal,
        ad_budget: budget,
        plan: 'starter',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating company:', error);
      setLoading(false);
      return;
    }

    // Create initial metrics
    await supabase.from('metrics').insert({
      company_id: company.id,
      revenue: 0,
      users_count: 0,
      signups_today: 0,
      churn_rate: 0,
      conversion_rate: 0,
      nps_score: 0,
    });

    // Create initial activity
    await supabase.from('agent_activities').insert({
      company_id: company.id,
      agent_role: 'ceo',
      agent_name: 'Atlas',
      action: 'Organization initialized',
      detail: `Archon AI organization created for "${idea}". All agents are spinning up and analyzing your business context.`,
      type: 'milestone',
    });

    router.push('/dashboard');
  };

  const canProceed =
    (step === 1 && idea.trim().length > 5) ||
    (step === 2 && goal) ||
    (step === 3 && budget) ||
    step === 4;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s <= step ? 'bg-primary' : 'bg-secondary'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: What are you building? */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card border border-border rounded-2xl p-8"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">What are you building?</h1>
                  <p className="text-sm text-muted-foreground">Describe your product or business idea</p>
                </div>
              </div>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="e.g. A SaaS platform that helps freelancers manage invoices and track payments automatically..."
                rows={5}
                className="w-full mt-6 px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                The more detail you provide, the better your AI team can serve you.
              </p>
            </motion.div>
          )}

          {/* Step 2: Primary goal */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card border border-border rounded-2xl p-8"
            >
              <h1 className="text-2xl font-bold mb-1">What&apos;s your primary goal?</h1>
              <p className="text-sm text-muted-foreground mb-6">This helps us prioritize which agents focus on what</p>
              <div className="grid grid-cols-2 gap-4">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGoal(g.value)}
                    className={`p-5 rounded-xl border text-left transition ${
                      goal === g.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50 hover:border-primary/30'
                    }`}
                  >
                    <g.icon className={`w-6 h-6 mb-2 ${goal === g.value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="font-semibold text-sm">{g.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{g.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Ad budget */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card border border-border rounded-2xl p-8"
            >
              <h1 className="text-2xl font-bold mb-1">Monthly ad budget?</h1>
              <p className="text-sm text-muted-foreground mb-6">Your Growth agent will optimize spend across channels</p>
              <div className="space-y-3">
                {BUDGETS.map((b) => (
                  <button
                    key={b.value}
                    onClick={() => setBudget(b.value)}
                    className={`w-full p-4 rounded-xl border text-left transition flex items-center justify-between ${
                      budget === b.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50 hover:border-primary/30'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{b.label}</p>
                      <p className="text-xs text-muted-foreground">{b.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      budget === b.value ? 'border-primary' : 'border-muted-foreground/30'
                    }`}>
                      {budget === b.value && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Preview */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card border border-border rounded-2xl p-8"
            >
              <h1 className="text-2xl font-bold mb-1">Your AI Organization is Ready</h1>
              <p className="text-sm text-muted-foreground mb-6">Here&apos;s what your agents will do first</p>

              <div className="bg-secondary/50 rounded-xl p-4 mb-4">
                <p className="text-sm text-muted-foreground mb-1">Building</p>
                <p className="font-medium">{idea}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground mb-1">Goal</p>
                  <p className="font-medium capitalize">{goal}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground mb-1">Ad Budget</p>
                  <p className="font-medium">{budget}/mo</p>
                </div>
              </div>

              <p className="text-sm font-medium mb-3">First actions by your agents:</p>
              <div className="space-y-2">
                {[
                  { icon: <Target className="w-4 h-4" />, name: 'Atlas', action: 'Define strategy, OKRs, and 30-day roadmap' },
                  { icon: <Zap className="w-4 h-4" />, name: 'Forge', action: 'Set up technical infrastructure and codebase' },
                  { icon: <TrendingUp className="w-4 h-4" />, name: 'Pulse', action: 'Research channels and create acquisition plan' },
                  { icon: <Brain className="w-4 h-4" />, name: 'Echo', action: 'Draft brand voice and first content pieces' },
                  { icon: <BarChart3 className="w-4 h-4" />, name: 'Lens', action: 'Run competitive analysis and market sizing' },
                ].map((a) => (
                  <div key={a.name} className="flex items-center gap-3 py-2 px-3 bg-secondary/30 rounded-lg">
                    <div className="text-primary">{a.icon}</div>
                    <span className="font-medium text-sm w-14">{a.name}</span>
                    <span className="text-sm text-muted-foreground">{a.action}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition ${
              step === 1 ? 'opacity-0 pointer-events-none' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-accent text-white rounded-xl font-medium transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-accent text-white rounded-xl font-medium transition glow-purple disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Launch My AI Company
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import BreathSection from '@/components/landing/BreathSection';

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`opacity-0 ${className}`}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black grain">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-transparent">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
            <span className="text-lg font-semibold tracking-tight text-white">Archon</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/login"
              className="px-5 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-44 pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="fade-in mb-8">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-white/60 tracking-wide">
              10 agents. One CEO. Your business on autopilot.
            </span>
          </div>
          <h1 className="fade-in text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[0.95] mb-8">
            AI That Runs Your
            <br />
            <span className="text-white/30">Company While You Sleep.</span>
          </h1>
          <p className="fade-in text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed">
            Atlas orchestrates 10 AI agents toward your goals.
            Engineering ships. Marketing posts. Sales closes.
            You get the results — and actionable recommendations.
          </p>
          <div className="fade-in">
            <Link
              href="/auth/login"
              className="inline-flex items-center px-8 py-4 bg-white text-black rounded-full text-base font-medium hover:bg-white/90 transition-colors"
            >
              Start Free — 25 Credits
            </Link>
            <p className="mt-4 text-sm text-white/30">
              3-minute setup. Run actions from your phone or voice.
            </p>
          </div>
        </div>
      </section>

      {/* The Breath - Activity Visualization */}
      <BreathSection />

      {/* Dashboard Preview */}
      <section className="pb-40 px-6">
        <FadeIn className="max-w-5xl mx-auto">
          <div className="glass rounded-2xl p-8">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Live Operations */}
              <div>
                <p className="text-xs font-medium text-white/30 tracking-widest uppercase mb-5">
                  Your Agents — Working Now
                </p>
                <div className="space-y-3">
                  {[
                    { name: 'Forge', task: 'Shipping checkout v2.3 — ETA 2 hours' },
                    { name: 'Echo', task: 'Publishing 3 social posts — 2.4K reach projected' },
                    { name: 'Arrow', task: 'Working 12 leads — 2 demos scheduled' },
                    { name: 'Lens', task: 'Monitoring competitors — opportunity detected' },
                    { name: 'Bloom', task: 'Engaging 3 at-risk accounts — retention in progress' },
                  ].map((a) => (
                    <div key={a.name} className="flex items-center gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot flex-shrink-0" />
                      <span className="font-medium text-white/70 w-14">{a.name}</span>
                      <span className="text-white/30">{a.task}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* KPI Tracker */}
              <div>
                <p className="text-xs font-medium text-white/30 tracking-widest uppercase mb-5">
                  KPI Tracker
                </p>
                <div className="space-y-4">
                  {[
                    { label: 'MRR', value: '$4,280', change: '+$340 this week', positive: true },
                    { label: 'Signups', value: '127', change: '+23 today', positive: true },
                    { label: 'Churn', value: '2.1%', change: '↓ 0.3%', positive: true },
                    { label: 'Pipeline', value: '$12,400', change: '', positive: true },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-baseline justify-between">
                      <span className="text-sm text-white/50">{metric.label}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-white/80">{metric.value}</span>
                        {metric.change && (
                          <span className="text-xs text-emerald-400">{metric.change}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-white/20 mt-6">
            Real work. Real results. All day, every day.
          </p>
        </FadeIn>
      </section>

      {/* Meet Atlas */}
      <section className="py-32 px-6">
        <FadeIn className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
            Meet Atlas.
          </h2>
          <p className="text-4xl md:text-5xl font-bold tracking-tight text-white/30 text-center mb-20">
            Your AI co-founder.
          </p>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Chat Preview */}
            <div className="glass rounded-2xl p-6">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-mono text-white/40 flex-shrink-0">
                    AT
                  </div>
                  <div className="glass rounded-xl rounded-tl-none px-4 py-3 max-w-[85%]">
                    <p className="text-sm text-white/70">Hey. I&apos;m Atlas — your AI co-founder. Tell me: what are you building?</p>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <div className="bg-white/[0.08] rounded-xl rounded-tr-none px-4 py-3 max-w-[85%]">
                    <p className="text-sm text-white/70">A SaaS for freelancer invoicing</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-mono text-white/40 flex-shrink-0">
                    AT
                  </div>
                  <div className="glass rounded-xl rounded-tl-none px-4 py-3 max-w-[85%]">
                    <p className="text-sm text-white/70">Nice — that&apos;s a $5.4B market. Here&apos;s what I found...</p>
                  </div>
                </div>
                <div className="ml-11 glass rounded-xl p-4 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400 font-medium mb-2">Market Intelligence</p>
                  <p className="text-sm text-white/50">Freelance market growing 17% YoY. Top pain point: late payments (68% of freelancers).</p>
                </div>
              </div>
            </div>
            {/* Feature Bullets */}
            <div className="space-y-6">
              {[
                { title: 'Aligns all agents on your KPIs', desc: 'Revenue, signups, churn — Atlas ensures everyone optimizes for what matters.' },
                { title: 'Coordinates cross-functional execution', desc: 'Engineering, marketing, sales work together — not in silos.' },
                { title: 'Sends you actionable summaries', desc: 'Not just updates — recommendations with priority levels you can trigger instantly.' },
                { title: 'Learns and adapts weekly', desc: 'Automatic retrospectives improve strategy. Your AI org gets smarter.' },
              ].map((feature) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-white/80">{feature.title}</p>
                    <p className="text-sm text-white/35 mt-1">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* The Reflection */}
      <section className="py-32 px-6">
        <FadeIn className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
            Every week, you get smarter.
          </h2>
          <p className="text-lg text-white/30 text-center mb-16 max-w-2xl mx-auto">
            The Reflection Agent analyzes your AI org&apos;s performance across every dimension:
            revenue impact, execution velocity, cost efficiency, and strategic alignment.
          </p>
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* What You Receive */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-white/90">You receive:</h3>
              <div className="space-y-4">
                {[
                  { title: 'What moved the needle', desc: '— and what didn\'t' },
                  { title: 'Recommendations ranked by impact', desc: '— critical, high, medium' },
                  { title: 'One-tap actions', desc: '— "Run this" from Slack, email, or voice' },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-white/80">{item.title}</span>
                      <span className="text-white/40"> {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Reflection Mockup */}
            <div className="glass rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-white/40 tracking-widest uppercase">
                  Weekly Reflection — Mar 3, 2026
                </p>
              </div>
              <div className="space-y-4 mb-6">
                <p className="text-sm text-white/50 mb-3">This Week:</p>
                <div className="space-y-2">
                  {[
                    { label: 'MRR', from: '$4,280', to: '$4,620', change: '+8%', positive: true },
                    { label: 'Signups', from: '127', to: '156', change: '+23%', positive: true },
                    { label: 'Churn', from: '2.1%', to: '1.8%', change: '-0.3%', positive: true },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between text-sm">
                      <span className="text-white/50">{metric.label}:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white/40">{metric.from}</span>
                        <span className="text-white/30">→</span>
                        <span className="text-white/70">{metric.to}</span>
                        <span className={metric.positive ? 'text-emerald-400' : 'text-red-400'}>({metric.change})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-3">
                <p className="text-sm text-white/50 mb-3">Top Recommendations:</p>
                <div className="glass rounded-lg p-3 border-l-2 border-red-500">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 text-xs font-bold">CRITICAL</span>
                    <span className="text-white/70 text-sm">Competitor launched free tier.</span>
                  </div>
                  <button className="mt-2 px-3 py-1 bg-white/[0.06] hover:bg-white/10 rounded text-xs text-purple-400 transition-colors">
                    Run competitive response campaign →
                  </button>
                </div>
                <div className="glass rounded-lg p-3 border-l-2 border-orange-500">
                  <div className="flex items-start gap-2">
                    <span className="text-orange-400 text-xs font-bold">HIGH</span>
                    <span className="text-white/70 text-sm">3 enterprise leads stalled.</span>
                  </div>
                  <button className="mt-2 px-3 py-1 bg-white/[0.06] hover:bg-white/10 rounded text-xs text-purple-400 transition-colors">
                    Trigger Arrow follow-up sequence →
                  </button>
                </div>
                <div className="glass rounded-lg p-3 border-l-2 border-emerald-500">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 text-xs font-bold">MEDIUM</span>
                    <span className="text-white/70 text-sm">Blog post performing well.</span>
                  </div>
                  <button className="mt-2 px-3 py-1 bg-white/[0.06] hover:bg-white/10 rounded text-xs text-purple-400 transition-colors">
                    Repurpose into LinkedIn carousel →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Ticker */}
      <section className="py-16 border-y border-white/[0.04] overflow-hidden">
        <div className="ticker-scroll flex gap-12 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-12 items-center text-white/15 text-sm tracking-widest uppercase">
              <span>KPI-driven</span>
              <span className="text-white/10">/</span>
              <span>Cross-functional</span>
              <span className="text-white/10">/</span>
              <span>Self-improving</span>
              <span className="text-white/10">/</span>
              <span>Actionable insights</span>
              <span className="text-white/10">/</span>
              <span>10 agents</span>
              <span className="text-white/10">/</span>
              <span>Zero employees</span>
              <span className="text-white/10">/</span>
              <span>KPI-driven</span>
              <span className="text-white/10">/</span>
              <span>Cross-functional</span>
              <span className="text-white/10">/</span>
              <span>Self-improving</span>
              <span className="text-white/10">/</span>
              <span>Actionable insights</span>
              <span className="text-white/10">/</span>
              <span>10 agents</span>
              <span className="text-white/10">/</span>
              <span>Zero employees</span>
              <span className="text-white/10">/</span>
            </div>
          ))}
        </div>
      </section>

      {/* The Org */}
      <section className="py-40 px-6">
        <FadeIn className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
            A complete organization.
          </h2>
          <p className="text-4xl md:text-5xl font-bold tracking-tight text-white/30 text-center mb-16">
            One CEO. Zero employees.
          </p>

          {/* Agent avatars row */}
          <div className="flex justify-center items-center gap-3 mb-12">
            {['AT', 'FO', 'PU', 'EC', 'PR', 'NE', 'AR', 'SH', 'LE', 'BL'].map((initials, i) => (
              <div
                key={initials}
                className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xs font-mono text-white/30 hover:bg-white/[0.08] hover:text-white/50 hover:border-white/[0.12] transition-all duration-300 cursor-default"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {initials}
              </div>
            ))}
          </div>

          <p className="text-lg text-white/40 text-center max-w-xl mx-auto">
            Engineering. Marketing. Sales. Support. Growth. Data.<br />
            <span className="text-white/25">Every function covered. All working for you.</span>
          </p>
        </FadeIn>
      </section>

      {/* How It Differs */}
      <section className="py-40 px-6">
        <FadeIn className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
            Not another AI wrapper.
          </h2>
          <p className="text-lg text-white/30 text-center max-w-2xl mx-auto mb-20">
            Other tools generate text. Archon executes your entire business.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: 'Outcome-obsessed execution',
                desc: 'Every agent optimizes for YOUR metrics — revenue, signups, churn, NPS. Not busywork. Results.',
              },
              {
                title: 'Cross-functional coordination',
                desc: 'Engineering, marketing, sales, support — working together, not in silos. Atlas ensures alignment.',
              },
              {
                title: 'Actionable intelligence',
                desc: 'Weekly reflections with prioritized recommendations. Critical issues flagged. One-tap to execute.',
              },
              {
                title: 'Self-improving AI org',
                desc: 'Automatic retrospectives. Strategy refinement. Your AI team gets smarter every week.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="glass rounded-2xl p-8"
              >
                <h3 className="text-lg font-semibold text-white/90 mb-3">{card.title}</h3>
                <p className="text-sm text-white/35 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* Pricing */}
      <section className="py-40 px-6">
        <FadeIn className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
            Pay as you grow.
          </h2>
          <p className="text-4xl md:text-5xl font-bold tracking-tight text-white/30 text-center mb-8">
            No subscriptions.
          </p>
          <p className="text-center text-white/40 mb-20 max-w-xl mx-auto">
            Start with 25 free credits. Buy more when you need them. Credits never expire.
          </p>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              {
                name: 'Starter',
                credits: 100,
                price: 9,
                bonus: 0,
                perCredit: '$0.09',
                popular: false,
              },
              {
                name: 'Growth',
                credits: 500,
                price: 39,
                bonus: 50,
                perCredit: '$0.07',
                popular: true,
              },
              {
                name: 'Scale',
                credits: 2000,
                price: 129,
                bonus: 300,
                perCredit: '$0.06',
                popular: false,
              },
              {
                name: 'Enterprise',
                credits: 10000,
                price: 499,
                bonus: 2000,
                perCredit: '$0.04',
                popular: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`glass rounded-2xl p-6 ${
                  plan.popular ? 'border-white/15 relative' : ''
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-white text-black text-xs font-medium rounded-full">
                    Best Value
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white/90">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-3 mb-2">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                </div>
                <p className="text-sm text-white/40 mb-4">
                  {plan.credits.toLocaleString()} credits
                  {plan.bonus > 0 && (
                    <span className="text-emerald-400"> +{plan.bonus} bonus</span>
                  )}
                </p>
                <p className="text-xs text-white/25 mb-5">{plan.perCredit} per credit</p>
                <Link
                  href="/auth/login"
                  className={`block text-center py-2.5 rounded-full text-sm font-medium transition-colors ${
                    plan.popular
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
                  }`}
                >
                  Buy credits
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-white/20 text-sm mt-8">
            Free trial includes 25 credits — enough for 2-3 meaningful tasks
          </p>
        </FadeIn>
      </section>

      {/* Final CTA */}
      <section className="py-40 px-6">
        <FadeIn className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-8">
            Ready for an AI company
            <br />
            <span className="text-white/30">that runs itself?</span>
          </h2>
          <Link
            href="/auth/login"
            className="inline-flex items-center px-8 py-4 bg-white text-black rounded-full text-base font-medium hover:bg-white/90 transition-colors"
          >
            Launch Your AI Org
          </Link>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/40">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
            <span className="text-sm font-medium text-white/40">Archon</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/20">
            <a href="#" className="hover:text-white/40 transition-colors">Terms</a>
            <a href="#" className="hover:text-white/40 transition-colors">Privacy</a>
          </div>
          <p className="text-xs text-white/20">
            &copy; 2026 Archon
          </p>
        </div>
      </footer>
    </div>
  );
}

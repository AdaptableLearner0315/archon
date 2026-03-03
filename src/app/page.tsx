'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

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
              Your AI organization, on autopilot
            </span>
          </div>
          <h1 className="fade-in text-6xl sm:text-7xl md:text-8xl font-bold tracking-tight text-white leading-[0.95] mb-8">
            Build a company.
            <br />
            <span className="text-white/30">Not a team.</span>
          </h1>
          <p className="fade-in text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed">
            10 autonomous AI agents that run your entire business — engineering,
            marketing, sales, analytics, and more. 24/7. Self-evolving.
          </p>
          <div className="fade-in">
            <Link
              href="/auth/login"
              className="inline-flex items-center px-8 py-4 bg-white text-black rounded-full text-base font-medium hover:bg-white/90 transition-colors"
            >
              Start building — $29/mo
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="pb-40 px-6">
        <FadeIn className="max-w-5xl mx-auto">
          <div className="glass rounded-2xl p-8">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Agent Activity */}
              <div>
                <p className="text-xs font-medium text-white/30 tracking-widest uppercase mb-5">
                  Agents — 5 active
                </p>
                <div className="space-y-3">
                  {[
                    { name: 'Forge', task: 'Deploying checkout v2.3' },
                    { name: 'Echo', task: 'Writing blog post on AI productivity' },
                    { name: 'Arrow', task: '12 cold emails queued' },
                    { name: 'Lens', task: 'Competitor pricing scan complete' },
                    { name: 'Bloom', task: 'Churn risk analysis running' },
                  ].map((a) => (
                    <div key={a.name} className="flex items-center gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot flex-shrink-0" />
                      <span className="font-medium text-white/70 w-14">{a.name}</span>
                      <span className="text-white/30">{a.task}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Live Metrics */}
              <div>
                <p className="text-xs font-medium text-white/30 tracking-widest uppercase mb-5">
                  Live Feed
                </p>
                <div className="space-y-3">
                  {[
                    { time: '14:02', text: 'Deployed checkout page with Stripe integration' },
                    { time: '14:01', text: 'Posted Reddit thread in r/SaaS — 12 upvotes' },
                    { time: '13:58', text: '+23 signups today (best day yet)' },
                    { time: '13:45', text: 'Competitor X raised prices — opportunity flagged' },
                    { time: '13:30', text: 'Drip email sequence activated: 847 contacts' },
                  ].map((f) => (
                    <div key={f.time} className="flex gap-3 text-sm">
                      <span className="text-white/20 font-mono w-12 flex-shrink-0">{f.time}</span>
                      <span className="text-white/50">{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-white/20 mt-6">
            Your agents start working in 60 seconds
          </p>
        </FadeIn>
      </section>

      {/* Ticker */}
      <section className="py-16 border-y border-white/[0.04] overflow-hidden">
        <div className="ticker-scroll flex gap-12 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-12 items-center text-white/15 text-sm tracking-widest uppercase">
              <span>10 agents</span>
              <span className="text-white/10">/</span>
              <span>24/7 autonomous</span>
              <span className="text-white/10">/</span>
              <span>Self-evolving</span>
              <span className="text-white/10">/</span>
              <span>Revenue-focused</span>
              <span className="text-white/10">/</span>
              <span>Real execution</span>
              <span className="text-white/10">/</span>
              <span>Zero employees</span>
              <span className="text-white/10">/</span>
              <span>10 agents</span>
              <span className="text-white/10">/</span>
              <span>24/7 autonomous</span>
              <span className="text-white/10">/</span>
              <span>Self-evolving</span>
              <span className="text-white/10">/</span>
              <span>Revenue-focused</span>
              <span className="text-white/10">/</span>
              <span>Real execution</span>
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
          <p className="text-4xl md:text-5xl font-bold tracking-tight text-white/30 text-center mb-20">
            Zero employees.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { name: 'Atlas', role: 'CEO & Strategist', desc: 'Strategy, OKRs, prioritization' },
              { name: 'Forge', role: 'Engineer', desc: 'Code, deploy, ship, iterate' },
              { name: 'Pulse', role: 'Growth Lead', desc: 'Acquisition, funnels, conversion' },
              { name: 'Echo', role: 'Marketing', desc: 'Content, social, brand voice' },
              { name: 'Prism', role: 'Product', desc: 'Features, roadmap, user research' },
              { name: 'Nexus', role: 'Operations', desc: 'Process, workflow, efficiency' },
              { name: 'Arrow', role: 'Sales', desc: 'Outreach, leads, pipeline' },
              { name: 'Shield', role: 'Support', desc: 'Tickets, FAQ, communications' },
              { name: 'Lens', role: 'Data Analyst', desc: 'Intel, research, analytics' },
              { name: 'Bloom', role: 'Customer Success', desc: 'Retention, NPS, churn reduction' },
            ].map((agent) => (
              <div
                key={agent.name}
                className="glass rounded-xl px-6 py-4 flex items-center gap-5"
              >
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-mono text-white/40 flex-shrink-0">
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-white/80">{agent.name}</span>
                    <span className="text-xs text-white/25">{agent.role}</span>
                  </div>
                  <p className="text-sm text-white/30 truncate">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
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
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                title: 'Deep execution',
                desc: 'Real code that ships. Real emails that send. Real ad campaigns that run. Not summaries — outcomes.',
              },
              {
                title: 'Self-evolving',
                desc: 'Weekly retrospectives, competitive intelligence, market scanning. Your AI org gets smarter every single day.',
              },
              {
                title: 'Outcome-obsessed',
                desc: 'Revenue, signups, churn, conversion — not vanity metrics. Every agent optimizes for real business results.',
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
            Simple pricing.
          </h2>
          <p className="text-4xl md:text-5xl font-bold tracking-tight text-white/30 text-center mb-20">
            Real outcomes.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                name: 'Starter',
                price: 29,
                desc: 'Validate your idea',
                features: ['4 core AI agents', 'Basic execution cycles', 'Core dashboard & metrics'],
                popular: false,
              },
              {
                name: 'Growth',
                price: 79,
                desc: 'Scale your business',
                features: ['All 10 AI agents', 'Priority execution speed', 'Weekly AI retrospectives', 'Self-evolution engine'],
                popular: true,
              },
              {
                name: 'Scale',
                price: 199,
                desc: 'Build a real company',
                features: ['Everything in Growth', 'Custom agent configuration', 'Competitive intelligence', 'Priority Slack support'],
                popular: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`glass rounded-2xl p-8 ${
                  plan.popular ? 'border-white/15' : ''
                }`}
              >
                {plan.popular && (
                  <span className="inline-block text-xs font-medium text-white/50 tracking-widest uppercase mb-4">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white/90">{plan.name}</h3>
                <p className="text-sm text-white/30 mb-5">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-white/25">/mo</span>
                </div>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/40">
                      <span className="text-white/20 mt-0.5">—</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/login"
                  className={`block text-center py-3 rounded-full text-sm font-medium transition-colors ${
                    plan.popular
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
                  }`}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* Final CTA */}
      <section className="py-40 px-6">
        <FadeIn className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-8">
            Your business.
            <br />
            <span className="text-white/30">On autopilot.</span>
          </h2>
          <Link
            href="/auth/login"
            className="inline-flex items-center px-8 py-4 bg-white text-black rounded-full text-base font-medium hover:bg-white/90 transition-colors"
          >
            Launch Archon
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

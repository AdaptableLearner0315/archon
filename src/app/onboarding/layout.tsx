import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome to Archon',
  description: 'Meet your AI co-founder',
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-black grain"
      style={{
        // Override theme variables for onboarding — monochrome
        '--primary': '#ffffff',
        '--accent': '#e5e5e5',
        '--ring': '#ffffff',
      } as React.CSSProperties}
    >
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-black to-black pointer-events-none" />

      {/* Minimal header */}
      <header className="fixed top-0 w-full z-50 bg-transparent">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
            <span className="text-sm font-semibold tracking-tight text-white">Archon</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10">
        {children}
      </main>
    </div>
  );
}

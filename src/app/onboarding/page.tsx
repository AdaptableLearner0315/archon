'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingChat } from '@/components/onboarding';

export default function OnboardingPage() {
  const router = useRouter();

  const handleComplete = useCallback((profile: Record<string, unknown>) => {
    console.log('Onboarding complete:', profile);
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen pt-16 flex flex-col">
      {/* Hero text */}
      <div className="text-center px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Let&apos;s get to know each other
        </h1>
        <p className="text-white/50 text-sm">
          A quick chat, then your AI team gets to work.
        </p>
      </div>

      {/* Chat container */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4">
        <OnboardingChat onComplete={handleComplete} />
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ProfileIncompleteNotificationProps {
  companyId: string;
}

export function ProfileIncompleteNotification({ companyId }: ProfileIncompleteNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      // Check if dismissed in session
      const dismissed = sessionStorage.getItem(`profile_nudge_dismissed_${companyId}`);
      if (dismissed) {
        setIsDismissed(true);
        return;
      }

      const supabase = createClient();

      // Check onboarding_profiles for skipped flag or missing business info
      const { data: profile } = await supabase
        .from('onboarding_profiles')
        .select('skipped, business_idea')
        .eq('company_id', companyId)
        .single();

      // Show notification if profile was skipped and no business idea provided
      const isIncomplete = profile?.skipped === true && !profile?.business_idea;

      setIsVisible(isIncomplete);
    };

    checkProfile();
  }, [companyId]);

  const handleDismiss = () => {
    sessionStorage.setItem(`profile_nudge_dismissed_${companyId}`, 'true');
    setIsDismissed(true);
  };

  if (!isVisible || isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6"
      >
        <div className="glass rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/90 font-medium">
                Complete your profile for a personalized experience
              </p>
              <p className="text-xs text-white/50 mt-1">
                Help your AI team understand your business better by sharing what you're building and your main challenges.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/dashboard/settings#profile"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-black bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
              >
                Complete Profile
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={handleDismiss}
                className="p-1.5 text-white/30 hover:text-white/50 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

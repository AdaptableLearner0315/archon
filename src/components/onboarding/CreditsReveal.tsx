'use client';

import { motion } from 'framer-motion';
import { Sparkles, Check, ArrowRight } from 'lucide-react';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  bonus: number;
  price: number;
  recommended?: boolean;
}

interface CreditsRevealProps {
  recommendedPackage: string;
  packages: CreditPackage[];
  freeCredits: number;
  onSelectPackage: (packageId: string) => void;
  onStartFree: () => void;
}

export function CreditsReveal({
  recommendedPackage,
  packages,
  freeCredits,
  onSelectPackage,
  onStartFree,
}: CreditsRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-4"
    >
      <div className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Your Personalized Plan</h3>
            <p className="text-xs text-white/40">Based on your business profile</p>
          </div>
        </div>

        {/* Free trial highlight */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-400">
                Start with {freeCredits} free credits
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                Enough for 2-3 meaningful tasks — no card required
              </p>
            </div>
            <button
              onClick={onStartFree}
              className="px-4 py-2 bg-emerald-500 text-black text-sm font-medium rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Start Free
            </button>
          </div>
        </motion.div>

        <p className="text-xs text-white/30 mb-3 text-center">or choose a credit package</p>

        {/* Credit packages */}
        <div className="grid gap-2">
          {packages.map((pkg, index) => {
            const isRecommended = pkg.id === recommendedPackage;
            return (
              <motion.button
                key={pkg.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                onClick={() => onSelectPackage(pkg.id)}
                className={`w-full p-3 rounded-lg border text-left transition-all ${
                  isRecommended
                    ? 'bg-white/[0.06] border-emerald-500/40 hover:border-emerald-500/60'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                        isRecommended
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : 'border-white/20 bg-white/[0.04]'
                      }`}
                    >
                      {isRecommended && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{pkg.name}</span>
                        {isRecommended && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-medium rounded">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/40">
                        {pkg.credits.toLocaleString()} credits
                        {pkg.bonus > 0 && (
                          <span className="text-emerald-400"> +{pkg.bonus} bonus</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">${pkg.price}</span>
                    <ArrowRight className="w-4 h-4 text-white/30" />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <p className="text-[10px] text-white/20 text-center mt-3">
          Credits never expire. Buy more anytime.
        </p>
      </div>
    </motion.div>
  );
}

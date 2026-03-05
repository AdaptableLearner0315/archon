'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 grain">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent" />

      <div className="w-full max-w-md relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
            <div>
              <h1 className="text-xl font-bold text-white">Welcome to Archon</h1>
              <p className="text-sm text-white/40">Sign in to your AI organization</p>
            </div>
          </div>

          {sent ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
              <p className="text-white/40 text-sm mb-4">
                We sent a magic link to <strong className="text-white">{email}</strong>
              </p>
              <p className="text-xs text-white/30">
                Click the link in your email to sign in. No password needed.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-6 text-sm text-white/40 hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-full text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-white hover:bg-white/90 text-black rounded-full font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending magic link...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send Magic Link
                  </>
                )}
              </button>

              <p className="text-xs text-center text-white/30">
                No password needed. We&apos;ll send you a secure link to sign in.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

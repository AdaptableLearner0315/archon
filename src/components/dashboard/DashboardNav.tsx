'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Zap,
  MessageSquare,
  ExternalLink,
  Settings,
  LogOut,
  CreditCard,
  Brain,
} from 'lucide-react';
import { useState } from 'react';
import NotificationBell from './NotificationBell';

interface DashboardNavProps {
  companyName: string;
  companySlug: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function DashboardNav({
  companyName,
  companySlug,
  sidebarOpen,
  onToggleSidebar,
}: DashboardNavProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleBilling = async () => {
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">Archon</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {companyName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/public/${companySlug}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Public Dashboard
          </Link>

          <Link
            href="/dashboard/memory"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
          >
            <Brain className="w-3.5 h-3.5" />
            Memory
          </Link>

          <button
            onClick={onToggleSidebar}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
              sidebarOpen
                ? 'bg-white/15 text-white border-white/30'
                : 'text-muted-foreground hover:text-foreground border-border'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Command Center
          </button>

          <NotificationBell />

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg z-50 py-1">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition"
                  >
                    <Settings className="w-4 h-4" />
                    Notifications
                  </Link>
                  <button
                    onClick={handleBilling}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition"
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-secondary/50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

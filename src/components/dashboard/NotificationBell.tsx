'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, X, Check, CheckCheck, AlertTriangle, FileText, TrendingUp, Zap } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface Notification {
  id: string;
  company_id: string;
  type: 'digest' | 'nudge' | 'artifact' | 'milestone';
  title: string;
  body: string;
  action_url: string | null;
  task_id: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { companyId } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/notifications?companyId=${companyId}&limit=15`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silently fail
    }
  }, [companyId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, notificationIds: [notification.id] }),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Silently fail
      }
    }

    if (notification.action_url) {
      setIsOpen(false);
      window.location.href = notification.action_url;
    }
  };

  const typeIcons = {
    digest: <TrendingUp className="w-4 h-4 text-primary" />,
    nudge: <AlertTriangle className="w-4 h-4 text-warning" />,
    artifact: <FileText className="w-4 h-4 text-success" />,
    milestone: <Zap className="w-4 h-4 text-primary" />,
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-danger text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={loading}
                    className="text-xs text-primary hover:text-primary/80 transition"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition ${
                      !n.read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {typeIcons[n.type]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${!n.read ? 'font-semibold' : 'font-medium'}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatTime(n.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                        {!n.read && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-[10px] text-primary">New</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Brain, Search, Plus, RefreshCw, Trash2, ChevronLeft } from 'lucide-react';
import type { CompanyMemory, MemoryDomain } from '@/lib/types';
import { MemoryTree } from '@/components/memory/MemoryTree';
import { MemoryDetail } from '@/components/memory/MemoryDetail';
import { CognitiveStats } from '@/components/memory/CognitiveStats';
import { AddMemoryModal } from '@/components/memory/AddMemoryModal';
import { EditMemoryModal } from '@/components/memory/EditMemoryModal';
import { MemoryIntelligence } from '@/components/memory/MemoryIntelligence';
import Link from 'next/link';

const DOMAIN_LABELS: Record<MemoryDomain, string> = {
  business_context: 'Business Context',
  competitors: 'Competitors',
  market: 'Market',
  agents: 'Agents',
};

const DOMAIN_ICONS: Record<MemoryDomain, string> = {
  business_context: '🏢',
  competitors: '🎯',
  market: '📊',
  agents: '🤖',
};

interface MemoryStats {
  total: number;
  active: number;
  archived: number;
  byDomain: Record<MemoryDomain, number>;
  lastUpdated: string | null;
}

export default function MemoryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [memories, setMemories] = useState<CompanyMemory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<MemoryDomain>('business_context');
  const [selectedMemory, setSelectedMemory] = useState<CompanyMemory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Load company and memories
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push('/auth/login');
          return;
        }

        // Get company
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!company) {
          router.push('/onboarding');
          return;
        }

        setCompanyId(company.id);

        // Load memories and stats
        await Promise.all([
          loadMemories(company.id, selectedDomain),
          loadStats(company.id),
        ]);

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load memory page:', error);
        setIsLoading(false);
      }
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time subscription for memory changes
  useEffect(() => {
    if (!companyId) return;

    const supabase = createClient();

    const subscription = supabase
      .channel(`memory-changes-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_memories',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMemory = mapRow(payload.new);
            if (newMemory.domain === selectedDomain && !newMemory.isArchived) {
              setMemories((prev) => [newMemory, ...prev]);
            }
            loadStats(companyId);
          } else if (payload.eventType === 'UPDATE') {
            const updatedMemory = mapRow(payload.new);
            if (updatedMemory.domain === selectedDomain) {
              if (updatedMemory.isArchived) {
                // Memory was archived - remove from list
                setMemories((prev) => prev.filter((m) => m.id !== updatedMemory.id));
                if (selectedMemory?.id === updatedMemory.id) {
                  setSelectedMemory(null);
                }
              } else {
                // Memory was updated - update in list
                setMemories((prev) =>
                  prev.map((m) => (m.id === updatedMemory.id ? updatedMemory : m))
                );
                if (selectedMemory?.id === updatedMemory.id) {
                  setSelectedMemory(updatedMemory);
                }
              }
            }
            loadStats(companyId);
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setMemories((prev) => prev.filter((m) => m.id !== deletedId));
            if (selectedMemory?.id === deletedId) {
              setSelectedMemory(null);
            }
            loadStats(companyId);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedDomain]);

  const loadMemories = async (cId: string, domain: MemoryDomain) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', cId)
      .eq('domain', domain)
      .eq('is_archived', false)
      .order('importance', { ascending: false })
      .order('last_accessed_at', { ascending: false })
      .limit(100);

    if (data) {
      setMemories(data.map(mapRow));
    }
  };

  const loadStats = async (cId: string) => {
    const supabase = createClient();

    const [totalResult, archivedResult, domainResult, lastResult] = await Promise.all([
      supabase.from('company_memories').select('*', { count: 'exact', head: true }).eq('company_id', cId),
      supabase.from('company_memories').select('*', { count: 'exact', head: true }).eq('company_id', cId).eq('is_archived', true),
      supabase.from('company_memories').select('domain').eq('company_id', cId).eq('is_archived', false),
      supabase.from('company_memories').select('updated_at').eq('company_id', cId).order('updated_at', { ascending: false }).limit(1).single(),
    ]);

    const total = totalResult.count ?? 0;
    const archived = archivedResult.count ?? 0;

    const byDomain: Record<MemoryDomain, number> = {
      business_context: 0,
      competitors: 0,
      market: 0,
      agents: 0,
    };

    if (domainResult.data) {
      for (const row of domainResult.data) {
        const d = row.domain as MemoryDomain;
        if (byDomain[d] !== undefined) {
          byDomain[d]++;
        }
      }
    }

    setStats({
      total,
      active: total - archived,
      archived,
      byDomain,
      lastUpdated: lastResult.data?.updated_at ?? null,
    });
  };

  const handleDomainChange = async (domain: MemoryDomain) => {
    setSelectedDomain(domain);
    setSelectedMemory(null);
    if (companyId) {
      await loadMemories(companyId, domain);
    }
  };

  const handleRefresh = async () => {
    if (companyId) {
      await Promise.all([
        loadMemories(companyId, selectedDomain),
        loadStats(companyId),
      ]);
    }
  };

  const handleArchive = async (memoryId: string) => {
    const supabase = createClient();
    await supabase
      .from('company_memories')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', memoryId);

    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    setSelectedMemory(null);
    if (companyId) {
      await loadStats(companyId);
    }
  };

  const handleBoostImportance = async (memoryId: string) => {
    const supabase = createClient();
    const memory = memories.find((m) => m.id === memoryId);
    if (!memory) return;

    const newImportance = Math.min(1, memory.importance + 0.1);
    await supabase
      .from('company_memories')
      .update({ importance: newImportance, updated_at: new Date().toISOString() })
      .eq('id', memoryId);

    setMemories((prev) =>
      prev.map((m) => (m.id === memoryId ? { ...m, importance: newImportance } : m))
    );
    if (selectedMemory?.id === memoryId) {
      setSelectedMemory({ ...selectedMemory, importance: newImportance });
    }
  };

  const handleAddMemory = async (input: {
    topic: string;
    content: string;
    importance: number;
  }) => {
    if (!companyId) return;

    const supabase = createClient();
    const scope = `/${selectedDomain}/${input.topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    const { data, error } = await supabase
      .from('company_memories')
      .insert({
        company_id: companyId,
        domain: selectedDomain,
        scope,
        topic: input.topic,
        content: input.content,
        importance: input.importance,
        confidence: 0.9,
        source: 'user',
      })
      .select()
      .single();

    if (!error && data) {
      setMemories((prev) => [mapRow(data), ...prev]);
      await loadStats(companyId);
    }

    setShowAddModal(false);
  };

  const handleEditMemory = async (updates: {
    topic: string;
    content: string;
    importance: number;
    confidence: number;
  }) => {
    if (!selectedMemory) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('company_memories')
      .update({
        topic: updates.topic,
        content: updates.content,
        importance: updates.importance,
        confidence: updates.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedMemory.id);

    if (!error) {
      const updated = {
        ...selectedMemory,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setSelectedMemory(updated);
    }

    setShowEditModal(false);
  };

  const filteredMemories = searchQuery
    ? memories.filter(
        (m) =>
          m.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : memories;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading memory...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/6">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white/60" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 rounded-xl">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">Memory</h1>
                  <p className="text-sm text-white/50">
                    Your AI organization&apos;s cognitive backbone
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5 text-white/60" />
              </button>

              {/* Add Memory */}
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Memory
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        {stats && <CognitiveStats stats={stats} />}

        {/* Domain Tabs */}
        <div className="flex items-center gap-2 mt-6 mb-4">
          {(Object.keys(DOMAIN_LABELS) as MemoryDomain[]).map((domain) => (
            <button
              key={domain}
              onClick={() => handleDomainChange(domain)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedDomain === domain
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'
              }`}
            >
              <span>{DOMAIN_ICONS[domain]}</span>
              <span>{DOMAIN_LABELS[domain]}</span>
              <span
                className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                  selectedDomain === domain ? 'bg-black/10' : 'bg-white/10'
                }`}
              >
                {stats?.byDomain[domain] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Memory Tree */}
          <div className="bg-black border border-white/6 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4">
              {DOMAIN_LABELS[selectedDomain]} ({filteredMemories.length})
            </h2>
            <MemoryTree
              memories={filteredMemories}
              selectedId={selectedMemory?.id}
              onSelect={setSelectedMemory}
            />
          </div>

          {/* Memory Detail */}
          <div className="bg-black border border-white/6 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4">
              Details
            </h2>
            {selectedMemory ? (
              <MemoryDetail
                memory={selectedMemory}
                onArchive={() => handleArchive(selectedMemory.id)}
                onBoost={() => handleBoostImportance(selectedMemory.id)}
                onEdit={() => setShowEditModal(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-white/30" />
                </div>
                <p className="text-white/40 text-sm">
                  Select a memory to view details
                </p>
              </div>
            )}
          </div>

          {/* Memory Intelligence */}
          {companyId && <MemoryIntelligence companyId={companyId} />}
        </div>
      </main>

      {/* Add Memory Modal */}
      {showAddModal && (
        <AddMemoryModal
          domain={selectedDomain}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddMemory}
        />
      )}

      {/* Edit Memory Modal */}
      {showEditModal && selectedMemory && (
        <EditMemoryModal
          memory={selectedMemory}
          onClose={() => setShowEditModal(false)}
          onSave={handleEditMemory}
        />
      )}
    </div>
  );
}

function mapRow(row: Record<string, unknown>): CompanyMemory {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    domain: row.domain as MemoryDomain,
    scope: row.scope as string,
    topic: row.topic as string,
    content: row.content as string,
    importance: row.importance as number,
    confidence: row.confidence as number,
    halfLifeDays: row.half_life_days as number,
    source: row.source as 'onboarding' | 'agent' | 'user' | 'consolidation',
    sourceAgent: row.source_agent as string | null,
    sourceCycleId: row.source_cycle_id as string | null,
    supersedes: row.supersedes as string | null,
    supersededBy: row.superseded_by as string | null,
    timesAccessed: row.times_accessed as number,
    lastAccessedAt: row.last_accessed_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as string | null,
    isArchived: row.is_archived as boolean,
  };
}

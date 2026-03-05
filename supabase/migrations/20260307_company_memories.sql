-- Cognitive Memory System: company_memories table
-- This table stores domain-organized memories that serve as the cognitive backbone
-- for all AI agents. Unlike agent_memory_long_term (per-agent), these memories
-- are company-wide and shared across all agents.

-- =============================================================================
-- TABLE: company_memories
-- =============================================================================

create table if not exists company_memories (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,

  -- Domain organization (4 knowledge domains)
  domain text not null check (domain in ('business_context', 'competitors', 'market', 'agents')),

  -- Hierarchical scope path (e.g., "/business/target_audience", "/competitors/calendly")
  scope text not null,

  -- Human-readable topic name
  topic text not null,

  -- Memory content (atomic fact or consolidated insight)
  content text not null,

  -- Cognitive scoring
  importance numeric default 0.5 check (importance >= 0 and importance <= 1),
  confidence numeric default 0.8 check (confidence >= 0 and confidence <= 1),

  -- Decay configuration (for recall scoring)
  half_life_days integer default 30,

  -- Source tracking
  source text default 'onboarding' check (source in ('onboarding', 'agent', 'user', 'consolidation')),
  source_agent text, -- Agent role that created this (null if from onboarding/user)
  source_cycle_id uuid references operating_cycles(id) on delete set null,

  -- Contradiction resolution (newer memories can supersede older ones)
  supersedes uuid references company_memories(id) on delete set null,
  superseded_by uuid references company_memories(id) on delete set null,

  -- Access tracking (for recall scoring and LRU)
  times_accessed integer default 0,
  last_accessed_at timestamptz default now(),

  -- Lifecycle management
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz, -- null = never expires, set by forget operation
  is_archived boolean default false
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query pattern: by domain
create index idx_company_memories_domain on company_memories(company_id, domain);

-- Hierarchical scope queries
create index idx_company_memories_scope on company_memories(company_id, scope);

-- Importance-based recall (high importance first)
create index idx_company_memories_importance on company_memories(company_id, importance desc);

-- Recency-based recall
create index idx_company_memories_accessed on company_memories(company_id, last_accessed_at desc);

-- Active memories filter (exclude archived and expired)
create index idx_company_memories_active on company_memories(company_id)
  where is_archived = false and (expires_at is null or expires_at > now());

-- Source tracking for audit
create index idx_company_memories_source on company_memories(company_id, source, created_at desc);

-- Contradiction chain lookup
create index idx_company_memories_supersedes on company_memories(supersedes) where supersedes is not null;

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

create trigger update_company_memories_updated_at
  before update on company_memories
  for each row
  execute function update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

alter table company_memories enable row level security;

-- Users can view their own company memories
create policy "View own company memories"
  on company_memories for select
  using (company_id in (select id from companies where user_id = auth.uid()));

-- Users can insert memories for their own company
create policy "Insert own company memories"
  on company_memories for insert
  with check (company_id in (select id from companies where user_id = auth.uid()));

-- Users can update their own company memories
create policy "Update own company memories"
  on company_memories for update
  using (company_id in (select id from companies where user_id = auth.uid()));

-- Users can delete their own company memories
create policy "Delete own company memories"
  on company_memories for delete
  using (company_id in (select id from companies where user_id = auth.uid()));

-- Service role bypass for backend operations (agent execution, cycle processing)
create policy "Service role bypass company memories"
  on company_memories for all
  using (auth.role() = 'service_role');

-- =============================================================================
-- HELPER FUNCTION: Composite recall score
-- =============================================================================

create or replace function calculate_memory_recall_score(
  p_importance numeric,
  p_confidence numeric,
  p_last_accessed_at timestamptz,
  p_half_life_days integer,
  p_times_accessed integer,
  -- Weights (configurable per-agent if needed)
  p_w_importance numeric default 0.3,
  p_w_confidence numeric default 0.2,
  p_w_recency numeric default 0.3,
  p_w_frequency numeric default 0.2
) returns numeric as $$
declare
  v_age_days numeric;
  v_recency_score numeric;
  v_frequency_score numeric;
begin
  -- Calculate age in days
  v_age_days := extract(epoch from (now() - p_last_accessed_at)) / 86400.0;

  -- Recency score with exponential decay based on half-life
  -- Score = 0.5^(age / half_life), clamped to [0, 1]
  v_recency_score := power(0.5, v_age_days / greatest(p_half_life_days, 1));
  v_recency_score := greatest(0, least(1, v_recency_score));

  -- Frequency score (logarithmic scale, capped)
  -- ln(1 + times_accessed) / ln(100) gives ~0.5 at 10 accesses, ~1.0 at 100
  v_frequency_score := ln(1 + p_times_accessed) / ln(100);
  v_frequency_score := greatest(0, least(1, v_frequency_score));

  -- Composite score
  return (p_importance * p_w_importance)
       + (p_confidence * p_w_confidence)
       + (v_recency_score * p_w_recency)
       + (v_frequency_score * p_w_frequency);
end;
$$ language plpgsql immutable;

-- =============================================================================
-- HELPER FUNCTION: Mark memory as accessed
-- =============================================================================

create or replace function touch_memory(p_memory_id uuid)
returns void as $$
begin
  update company_memories
  set times_accessed = times_accessed + 1,
      last_accessed_at = now()
  where id = p_memory_id;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- HELPER FUNCTION: Archive superseded memory
-- =============================================================================

create or replace function supersede_memory(
  p_old_memory_id uuid,
  p_new_memory_id uuid
) returns void as $$
begin
  -- Mark old memory as superseded
  update company_memories
  set superseded_by = p_new_memory_id,
      is_archived = true,
      updated_at = now()
  where id = p_old_memory_id;

  -- Mark new memory with supersedes reference
  update company_memories
  set supersedes = p_old_memory_id,
      updated_at = now()
  where id = p_new_memory_id;
end;
$$ language plpgsql security definer;

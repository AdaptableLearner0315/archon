-- Advanced Cognitive Memory System
-- Adds semantic search, memory associations, usage tracking, lessons, and adaptive recall

-- =============================================================================
-- PGVECTOR EXTENSION (for semantic search)
-- =============================================================================

-- Enable vector extension (free on Supabase)
create extension if not exists vector;

-- Add embedding column to company_memories
alter table company_memories add column if not exists embedding vector(1536);

-- Add reinforcement tracking
alter table company_memories add column if not exists reinforcement_count integer default 1;

-- Update source constraint to include 'inference'
alter table company_memories drop constraint if exists company_memories_source_check;
alter table company_memories add constraint company_memories_source_check
  check (source in ('onboarding', 'agent', 'user', 'consolidation', 'inference'));

-- Create HNSW index for fast similarity search (better than IVFFlat for this scale)
create index if not exists idx_company_memories_embedding on company_memories
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- =============================================================================
-- TABLE: memory_associations (cross-memory relationships)
-- =============================================================================

create table if not exists memory_associations (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  memory_a_id uuid references company_memories(id) on delete cascade not null,
  memory_b_id uuid references company_memories(id) on delete cascade not null,

  -- Relationship type
  relationship_type text not null check (relationship_type in (
    'supports',      -- A supports/confirms B
    'contradicts',   -- A contradicts B (trigger resolution)
    'elaborates',    -- A adds detail to B
    'derives_from',  -- A was inferred from B
    'related_to'     -- General semantic relation
  )),

  -- Association strength (0-1)
  strength numeric default 0.5 check (strength >= 0 and strength <= 1),

  -- Metadata
  created_at timestamptz default now(),
  created_by text, -- 'system' | 'user' | agent role

  -- Prevent duplicate associations
  unique(memory_a_id, memory_b_id)
);

-- Indexes for memory_associations
create index idx_memory_associations_company on memory_associations(company_id);
create index idx_memory_associations_memory_a on memory_associations(memory_a_id);
create index idx_memory_associations_memory_b on memory_associations(memory_b_id);
create index idx_memory_associations_type on memory_associations(company_id, relationship_type);
create index idx_memory_associations_contradicts on memory_associations(company_id)
  where relationship_type = 'contradicts';

-- RLS for memory_associations
alter table memory_associations enable row level security;

create policy "View own memory associations"
  on memory_associations for select
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Insert own memory associations"
  on memory_associations for insert
  with check (company_id in (select id from companies where user_id = auth.uid()));

create policy "Delete own memory associations"
  on memory_associations for delete
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Service role bypass memory associations"
  on memory_associations for all
  using (auth.role() = 'service_role');

-- =============================================================================
-- TABLE: memory_usage_logs (track when memories are used)
-- =============================================================================

create table if not exists memory_usage_logs (
  id uuid default gen_random_uuid() primary key,
  memory_id uuid references company_memories(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id) on delete set null,

  -- Usage context
  used_by_agent text not null,      -- Agent role that used this memory
  task_context text,                 -- What task was the memory used for

  -- Outcome tracking
  was_helpful boolean,               -- User/agent feedback on usefulness
  relevance_score numeric,           -- How relevant was this memory (0-1)

  -- Timing
  created_at timestamptz default now()
);

-- Indexes for memory_usage_logs
create index idx_memory_usage_memory on memory_usage_logs(memory_id);
create index idx_memory_usage_company on memory_usage_logs(company_id, created_at desc);
create index idx_memory_usage_cycle on memory_usage_logs(cycle_id) where cycle_id is not null;
create index idx_memory_usage_agent on memory_usage_logs(company_id, used_by_agent);

-- RLS for memory_usage_logs
alter table memory_usage_logs enable row level security;

create policy "View own memory usage logs"
  on memory_usage_logs for select
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Insert own memory usage logs"
  on memory_usage_logs for insert
  with check (company_id in (select id from companies where user_id = auth.uid()));

create policy "Service role bypass memory usage logs"
  on memory_usage_logs for all
  using (auth.role() = 'service_role');

-- =============================================================================
-- TABLE: memory_recall_configs (per-company adaptive recall weights)
-- =============================================================================

create table if not exists memory_recall_configs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade unique not null,

  -- Base weights (adjusted over time, must sum to ~1.0)
  weight_semantic numeric default 0.35 check (weight_semantic >= 0 and weight_semantic <= 1),
  weight_importance numeric default 0.25 check (weight_importance >= 0 and weight_importance <= 1),
  weight_confidence numeric default 0.15 check (weight_confidence >= 0 and weight_confidence <= 1),
  weight_recency numeric default 0.15 check (weight_recency >= 0 and weight_recency <= 1),
  weight_frequency numeric default 0.10 check (weight_frequency >= 0 and weight_frequency <= 1),

  -- Domain-specific boosts (when agent is from this domain)
  domain_boosts jsonb default '{"business_context": 1.0, "competitors": 1.0, "market": 1.0, "agents": 1.0}',

  -- Agent-domain affinities (learned over time)
  -- e.g., {"marketing": {"market": 1.2, "competitors": 1.1}}
  agent_domain_affinities jsonb default '{}',

  -- Decay adjustments by domain (in days)
  -- e.g., {"competitors": 14} means competitor data decays faster
  domain_half_life_overrides jsonb default '{}',

  -- Version tracking for rollback
  version integer default 1,
  updated_at timestamptz default now()
);

-- Trigger to validate weights sum to ~1
create or replace function validate_recall_weights()
returns trigger as $$
begin
  if (NEW.weight_semantic + NEW.weight_importance + NEW.weight_confidence +
      NEW.weight_recency + NEW.weight_frequency) not between 0.95 and 1.05 then
    raise exception 'Recall weights must sum to approximately 1.0 (got %)',
      NEW.weight_semantic + NEW.weight_importance + NEW.weight_confidence +
      NEW.weight_recency + NEW.weight_frequency;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger check_recall_weights
before insert or update on memory_recall_configs
for each row execute function validate_recall_weights();

-- RLS for memory_recall_configs
alter table memory_recall_configs enable row level security;

create policy "View own memory recall config"
  on memory_recall_configs for select
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Manage own memory recall config"
  on memory_recall_configs for all
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Service role bypass memory recall configs"
  on memory_recall_configs for all
  using (auth.role() = 'service_role');

-- =============================================================================
-- TABLE: memory_lessons (strategy learnings from memory performance)
-- =============================================================================

create table if not exists memory_lessons (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,

  -- What was learned
  lesson text not null,
  evidence jsonb not null default '[]', -- Array of {period, metric, value}

  -- Strategy change details
  strategy_type text not null check (strategy_type in (
    'weight_adjustment',    -- Recall weight changes
    'decay_adjustment',     -- Half-life changes
    'attention_bias',       -- Agent domain preferences
    'domain_priority'       -- Domain ranking changes
  )),
  strategy_before jsonb,    -- Previous configuration
  strategy_after jsonb,     -- New configuration

  -- Validation lifecycle
  status text default 'proposed' check (status in (
    'proposed',    -- Just suggested, not yet applied
    'validating',  -- Applied and being monitored
    'active',      -- Validated and confirmed effective
    'deprecated'   -- Rolled back or superseded
  )),
  validation_cycles integer default 0,
  required_cycles integer default 5,

  -- Performance tracking
  performance_before numeric,  -- Accuracy before applying
  performance_after numeric,   -- Accuracy after applying (null until measured)

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for memory_lessons
create index idx_memory_lessons_company on memory_lessons(company_id, status);
create index idx_memory_lessons_active on memory_lessons(company_id)
  where status = 'active';
create index idx_memory_lessons_validating on memory_lessons(company_id)
  where status = 'validating';

-- Auto-update updated_at
create trigger update_memory_lessons_updated_at
  before update on memory_lessons
  for each row
  execute function update_updated_at_column();

-- RLS for memory_lessons
alter table memory_lessons enable row level security;

create policy "View own memory lessons"
  on memory_lessons for select
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Manage own memory lessons"
  on memory_lessons for all
  using (company_id in (select id from companies where user_id = auth.uid()));

create policy "Service role bypass memory lessons"
  on memory_lessons for all
  using (auth.role() = 'service_role');

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to find memories similar by embedding (semantic search)
create or replace function search_memories_by_embedding(
  p_company_id uuid,
  p_embedding vector(1536),
  p_match_threshold float default 0.7,
  p_match_count int default 10
)
returns table (
  id uuid,
  domain text,
  scope text,
  topic text,
  content text,
  importance numeric,
  confidence numeric,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    cm.id,
    cm.domain,
    cm.scope,
    cm.topic,
    cm.content,
    cm.importance,
    cm.confidence,
    1 - (cm.embedding <=> p_embedding) as similarity
  from company_memories cm
  where cm.company_id = p_company_id
    and cm.is_archived = false
    and cm.embedding is not null
    and 1 - (cm.embedding <=> p_embedding) > p_match_threshold
  order by cm.embedding <=> p_embedding
  limit p_match_count;
end;
$$;

-- Function to find potentially contradicting memories
create or replace function find_potential_contradictions(
  p_company_id uuid,
  p_memory_id uuid,
  p_similarity_threshold float default 0.8
)
returns table (
  memory_id uuid,
  topic text,
  content text,
  similarity float
)
language plpgsql
as $$
declare
  v_embedding vector(1536);
begin
  -- Get the embedding of the target memory
  select embedding into v_embedding
  from company_memories
  where id = p_memory_id;

  if v_embedding is null then
    return;
  end if;

  return query
  select
    cm.id as memory_id,
    cm.topic,
    cm.content,
    1 - (cm.embedding <=> v_embedding) as similarity
  from company_memories cm
  where cm.company_id = p_company_id
    and cm.id != p_memory_id
    and cm.is_archived = false
    and cm.embedding is not null
    and 1 - (cm.embedding <=> v_embedding) > p_similarity_threshold
  order by cm.embedding <=> v_embedding
  limit 5;
end;
$$;

-- Function to calculate memory usage stats
create or replace function get_memory_usage_stats(
  p_company_id uuid,
  p_days int default 7
)
returns table (
  total_recalls bigint,
  helpful_recalls bigint,
  unhelpful_recalls bigint,
  recall_accuracy numeric,
  avg_relevance numeric
)
language sql
as $$
  select
    count(*) as total_recalls,
    count(*) filter (where was_helpful = true) as helpful_recalls,
    count(*) filter (where was_helpful = false) as unhelpful_recalls,
    case
      when count(*) filter (where was_helpful is not null) > 0
      then round(
        count(*) filter (where was_helpful = true)::numeric /
        count(*) filter (where was_helpful is not null)::numeric,
        3
      )
      else null
    end as recall_accuracy,
    round(avg(relevance_score), 3) as avg_relevance
  from memory_usage_logs
  where company_id = p_company_id
    and created_at > now() - (p_days || ' days')::interval;
$$;

-- =============================================================================
-- ENABLE REALTIME
-- =============================================================================

-- Enable realtime for memory tables (for dashboard subscriptions)
alter publication supabase_realtime add table company_memories;
alter publication supabase_realtime add table memory_associations;

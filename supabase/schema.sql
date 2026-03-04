-- Archon Database Schema
-- Run this in your Supabase SQL Editor

-- Companies table
create table if not exists companies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  description text not null default '',
  goal text not null default 'revenue' check (goal in ('revenue', 'users', 'launch', 'brand')),
  ad_budget text not null default '$0',
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'scale')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent activities
create table if not exists agent_activities (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  agent_name text not null,
  action text not null,
  detail text not null default '',
  type text not null default 'action' check (type in ('action', 'insight', 'milestone', 'alert')),
  created_at timestamptz default now()
);

-- Metrics snapshots
create table if not exists metrics (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  revenue numeric default 0,
  users_count integer default 0,
  signups_today integer default 0,
  churn_rate numeric default 0,
  conversion_rate numeric default 0,
  nps_score numeric default 0,
  created_at timestamptz default now()
);

-- Command center messages
create table if not exists command_messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  role text not null check (role in ('user', 'agent')),
  agent_role text,
  agent_name text,
  content text not null,
  created_at timestamptz default now()
);

-- Weekly retrospectives
create table if not exists weekly_retros (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  summary text not null,
  top_insight text not null,
  agent_performance jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Agent configurations per company
create table if not exists agent_configs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  autonomy_level text not null default 'full-auto' check (autonomy_level in ('full-auto', 'approve-big', 'manual')),
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, agent_role)
);

-- RLS Policies
alter table companies enable row level security;
alter table agent_activities enable row level security;
alter table metrics enable row level security;
alter table command_messages enable row level security;
alter table weekly_retros enable row level security;
alter table agent_configs enable row level security;

-- Companies: users can only see their own
create policy "Users can view own companies" on companies
  for select using (auth.uid() = user_id);
create policy "Users can insert own companies" on companies
  for insert with check (auth.uid() = user_id);
create policy "Users can update own companies" on companies
  for update using (auth.uid() = user_id);

-- Public companies viewable by anyone
create policy "Public companies viewable" on companies
  for select using (is_public = true);

-- Activities: viewable by company owner
create policy "View own activities" on agent_activities
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own activities" on agent_activities
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Public activities
create policy "Public activities viewable" on agent_activities
  for select using (company_id in (select id from companies where is_public = true));

-- Metrics
create policy "View own metrics" on metrics
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own metrics" on metrics
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Public metrics
create policy "Public metrics viewable" on metrics
  for select using (company_id in (select id from companies where is_public = true));

-- Messages
create policy "View own messages" on command_messages
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own messages" on command_messages
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));

-- Retros
create policy "View own retros" on weekly_retros
  for select using (company_id in (select id from companies where user_id = auth.uid()));

-- Agent configs
create policy "View own configs" on agent_configs
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own configs" on agent_configs
  for update using (company_id in (select id from companies where user_id = auth.uid()));

-- Indexes
create index idx_activities_company on agent_activities(company_id, created_at desc);
create index idx_metrics_company on metrics(company_id, created_at desc);
create index idx_messages_company on command_messages(company_id, created_at desc);
create index idx_companies_slug on companies(slug);
create index idx_companies_user on companies(user_id);

-- ============================================================
-- Intelligence Layer Schema
-- ============================================================

-- Alter companies: add cycle scheduling
alter table companies add column if not exists cycle_schedule text not null default 'daily' check (cycle_schedule in ('manual', 'daily', 'weekly'));
alter table companies add column if not exists cycle_time_utc text not null default '02:00';

-- Alter agent_configs: add prompt/thinking config
alter table agent_configs add column if not exists custom_prompt_additions text;
alter table agent_configs add column if not exists max_tokens_per_call integer default 4096;
alter table agent_configs add column if not exists use_extended_thinking boolean default false;
alter table agent_configs add column if not exists thinking_budget integer default 2048;

-- Operating cycles
create table if not exists operating_cycles (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'planning', 'executing', 'completing', 'notifying', 'done', 'failed')),
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'api')),
  plan jsonb,
  user_directive text,
  total_tokens_used integer default 0,
  total_cost_usd numeric default 0,
  started_at timestamptz default now(),
  completed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Cycle tasks
create table if not exists cycle_tasks (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  agent_name text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'needs_data', 'completed', 'failed', 'blocked')),
  result text,
  depends_on text[] default '{}',
  tokens_used integer default 0,
  cost_usd numeric default 0,
  needs_human_input boolean default false,
  human_input_question text,
  human_input_response text,
  human_input_responded_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Agent messages (inter-agent communication)
create table if not exists agent_messages (
  id uuid default gen_random_uuid() primary key,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  from_role text not null,
  to_role text, -- null = broadcast
  type text not null default 'request' check (type in ('request', 'response', 'broadcast', 'delegation')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  subject text not null,
  body text not null,
  payload jsonb,
  correlation_id uuid,
  created_at timestamptz default now()
);

-- Short-term memory (Tier 2)
create table if not exists agent_memory_short_term (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  topic text not null,
  content text not null,
  memory_type text not null default 'insight' check (memory_type in ('decision', 'insight', 'task_result', 'conversation_summary', 'error', 'delegation')),
  relevance_score numeric default 0.5,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz default now()
);

-- Long-term memory (Tier 3)
create table if not exists agent_memory_long_term (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  category text not null check (category in ('pattern', 'strategy', 'company_knowledge', 'agent_behavior', 'market_insight')),
  summary text not null,
  confidence numeric default 0.5,
  times_referenced integer default 0,
  last_referenced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Agent performance tracking
create table if not exists agent_performance (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id) on delete cascade not null,
  agent_role text not null,
  tasks_completed integer default 0,
  tasks_failed integer default 0,
  avg_quality_score numeric default 0,
  total_tokens_used integer default 0,
  total_cost_usd numeric default 0,
  score numeric default 0,
  created_at timestamptz default now()
);

-- Prompt versions
create table if not exists prompt_versions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  agent_role text not null,
  version integer not null default 1,
  prompt_text text not null,
  is_active boolean default false,
  performance_before numeric,
  performance_after numeric,
  created_at timestamptz default now(),
  unique(company_id, agent_role, version)
);

-- Notification preferences
create table if not exists notification_preferences (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  email_enabled boolean default true,
  email_address text,
  whatsapp_enabled boolean default false,
  whatsapp_number text,
  digest_format text default 'detailed' check (digest_format in ('brief', 'detailed')),
  digest_frequency text not null default 'hourly' check (digest_frequency in ('hourly', '6h', 'daily', 'weekly')),
  slack_enabled boolean default false,
  slack_webhook_url text,
  webapp_enabled boolean default true,
  last_digest_sent_at timestamptz,
  created_at timestamptz default now(),
  unique(company_id)
);

-- RLS for new tables
alter table operating_cycles enable row level security;
alter table cycle_tasks enable row level security;
alter table agent_messages enable row level security;
alter table agent_memory_short_term enable row level security;
alter table agent_memory_long_term enable row level security;
alter table agent_performance enable row level security;
alter table prompt_versions enable row level security;
alter table notification_preferences enable row level security;

-- Operating cycles policies
create policy "View own cycles" on operating_cycles
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own cycles" on operating_cycles
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own cycles" on operating_cycles
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass cycles" on operating_cycles
  for all using (auth.role() = 'service_role');

-- Cycle tasks policies
create policy "View own cycle tasks" on cycle_tasks
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own cycle tasks" on cycle_tasks
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own cycle tasks" on cycle_tasks
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass cycle tasks" on cycle_tasks
  for all using (auth.role() = 'service_role');

-- Agent messages policies
create policy "View own agent messages" on agent_messages
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own agent messages" on agent_messages
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass agent messages" on agent_messages
  for all using (auth.role() = 'service_role');

-- Short-term memory policies
create policy "View own short term memory" on agent_memory_short_term
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own short term memory" on agent_memory_short_term
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own short term memory" on agent_memory_short_term
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass short term memory" on agent_memory_short_term
  for all using (auth.role() = 'service_role');

-- Long-term memory policies
create policy "View own long term memory" on agent_memory_long_term
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own long term memory" on agent_memory_long_term
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own long term memory" on agent_memory_long_term
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own long term memory" on agent_memory_long_term
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass long term memory" on agent_memory_long_term
  for all using (auth.role() = 'service_role');

-- Agent performance policies
create policy "View own performance" on agent_performance
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own performance" on agent_performance
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass performance" on agent_performance
  for all using (auth.role() = 'service_role');

-- Prompt versions policies
create policy "View own prompts" on prompt_versions
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own prompts" on prompt_versions
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own prompts" on prompt_versions
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass prompts" on prompt_versions
  for all using (auth.role() = 'service_role');

-- Notification preferences policies
create policy "View own notification prefs" on notification_preferences
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Upsert own notification prefs" on notification_preferences
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own notification prefs" on notification_preferences
  for update using (company_id in (select id from companies where user_id = auth.uid()));

-- In-app notifications
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  type text not null check (type in ('digest', 'nudge', 'artifact', 'milestone')),
  title text not null,
  body text not null,
  action_url text,
  task_id uuid references cycle_tasks(id),
  read boolean default false,
  created_at timestamptz default now()
);

-- Proof of work artifacts
create table if not exists artifacts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id),
  task_id uuid references cycle_tasks(id),
  agent_role text not null,
  agent_name text not null,
  title text not null,
  type text not null check (type in ('report', 'code', 'strategy', 'content', 'analysis', 'email_draft', 'other')),
  content text not null,
  preview text not null default '',
  created_at timestamptz default now()
);

-- RLS for notifications + artifacts
alter table notifications enable row level security;
alter table artifacts enable row level security;

create policy "View own notifications" on notifications
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own notifications" on notifications
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass notifications" on notifications
  for all using (auth.role() = 'service_role');

create policy "View own artifacts" on artifacts
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass artifacts" on artifacts
  for all using (auth.role() = 'service_role');

-- Public artifacts viewable
create policy "Public artifacts viewable" on artifacts
  for select using (company_id in (select id from companies where is_public = true));

-- Indexes for new tables
create index idx_cycles_company on operating_cycles(company_id, created_at desc);
create index idx_cycles_status on operating_cycles(company_id, status);
create index idx_cycle_tasks_cycle on cycle_tasks(cycle_id, status);
create index idx_cycle_tasks_company on cycle_tasks(company_id, agent_role, created_at desc);
create index idx_cycle_tasks_human_input on cycle_tasks(company_id, needs_human_input) where needs_human_input = true;
create index idx_agent_messages_cycle on agent_messages(cycle_id, created_at);
create index idx_agent_messages_to on agent_messages(company_id, to_role, created_at desc);
create index idx_agent_messages_correlation on agent_messages(correlation_id);
create index idx_stm_agent on agent_memory_short_term(company_id, agent_role, created_at desc);
create index idx_stm_topic on agent_memory_short_term(company_id, topic);
create index idx_stm_expires on agent_memory_short_term(expires_at);
create index idx_ltm_agent on agent_memory_long_term(company_id, agent_role, category);
create index idx_ltm_referenced on agent_memory_long_term(company_id, last_referenced_at desc);
create index idx_performance_agent on agent_performance(company_id, agent_role, created_at desc);
create index idx_performance_cycle on agent_performance(cycle_id);
create index idx_prompt_versions_active on prompt_versions(company_id, agent_role, is_active);
create index idx_notifications_company on notifications(company_id, created_at desc);
create index idx_notifications_unread on notifications(company_id, read) where read = false;
create index idx_artifacts_company on artifacts(company_id, created_at desc);
create index idx_artifacts_cycle on artifacts(cycle_id);

-- ============================================================
-- SEO + Ads Module Schema (v2.1)
-- ============================================================

-- Add SEO/Ads columns to companies
alter table companies add column if not exists website_url text;
alter table companies add column if not exists daily_ad_budget numeric default 0;
alter table companies add column if not exists seo_enabled boolean default false;
alter table companies add column if not exists ads_enabled boolean default false;

-- SEO Audits table
create table if not exists seo_audits (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  cycle_id uuid references operating_cycles(id),
  url text not null,
  audit_type text not null check (audit_type in ('technical', 'on_page', 'keywords')),
  results jsonb not null,
  score numeric,
  created_at timestamptz default now()
);

-- Ad Platform Credentials (encrypted)
create table if not exists ad_platform_credentials (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  platform text not null check (platform in ('google', 'meta', 'tiktok', 'linkedin')),
  credentials_encrypted text not null,
  account_id text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, platform)
);

-- Budget Changes Log
create table if not exists budget_changes (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  platform text not null,
  campaign_id text not null,
  previous_budget numeric not null,
  new_budget numeric not null,
  change_percent numeric not null,
  auto_approved boolean not null,
  approved_by text,
  reason text,
  created_at timestamptz default now()
);

-- RLS for SEO + Ads tables
alter table seo_audits enable row level security;
alter table ad_platform_credentials enable row level security;
alter table budget_changes enable row level security;

create policy "View own seo audits" on seo_audits
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass seo audits" on seo_audits
  for all using (auth.role() = 'service_role');

create policy "View own ad credentials" on ad_platform_credentials
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Insert own ad credentials" on ad_platform_credentials
  for insert with check (company_id in (select id from companies where user_id = auth.uid()));
create policy "Update own ad credentials" on ad_platform_credentials
  for update using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Delete own ad credentials" on ad_platform_credentials
  for delete using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass ad credentials" on ad_platform_credentials
  for all using (auth.role() = 'service_role');

create policy "View own budget changes" on budget_changes
  for select using (company_id in (select id from companies where user_id = auth.uid()));
create policy "Service role bypass budget changes" on budget_changes
  for all using (auth.role() = 'service_role');

-- Indexes for SEO + Ads tables
create index idx_seo_audits_company on seo_audits(company_id, created_at desc);
create index idx_seo_audits_url on seo_audits(company_id, url);
create index idx_ad_credentials_company on ad_platform_credentials(company_id, platform);
create index idx_budget_changes_company on budget_changes(company_id, created_at desc);

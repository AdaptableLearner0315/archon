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

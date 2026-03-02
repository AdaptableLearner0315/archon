# Polsia.com — Reverse-Engineered Architecture

## Context
This is a research document, not an implementation plan. The goal is to reverse engineer
polsia.com from its public HTML, JS bundle, CSS, API routes, and structured data to produce
a comprehensive architectural system diagram.

---

## 1. HIGH-LEVEL SYSTEM DIAGRAM

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              POLSIA — SYSTEM ARCHITECTURE                            │
│                     "AI That Runs Your Company While You Sleep"                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           CLIENT LAYER (Browser SPA)                            │  │
│  │                                                                                 │  │
│  │   React 19 + Vite + React Router v7 + Redux Toolkit + Immer + Recharts         │  │
│  │   react-markdown + canvas-confetti + d3 (via recharts)                          │  │
│  │                                                                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────────┐ │  │
│  │  │ Landing  │ │  Auth    │ │Dashboard │ │Settings  │ │  Explore / Public     │ │  │
│  │  │  Page    │ │Login/Reg │ │  (main)  │ │& Billing │ │  Company Pages        │ │  │
│  │  └──────────┘ └──────────┘ └────┬─────┘ └──────────┘ └───────────────────────┘ │  │
│  │                                  │                                              │  │
│  │              ┌───────────────────┼────────────────────┐                         │  │
│  │              │                   │                    │                          │  │
│  │  ┌───────────▼──┐  ┌────────────▼─────┐  ┌──────────▼──────────┐               │  │
│  │  │  Terminal /   │  │  Agent Panel &   │  │   KPI / Analytics   │               │  │
│  │  │  Chat UI      │  │  Live Feed       │  │   (Recharts)        │               │  │
│  │  │  (SSE stream) │  │  (SSE stream)    │  │                     │               │  │
│  │  └───────┬───────┘  └────────┬─────────┘  └──────────┬──────────┘               │  │
│  │          │ EventSource       │ EventSource            │ fetch                    │  │
│  └──────────┼───────────────────┼────────────────────────┼─────────────────────────┘  │
│             │                   │                        │                            │
│  ═══════════╪═══════════════════╪════════════════════════╪═══════ HTTPS ════════════  │
│             │                   │                        │                            │
│  ┌──────────▼───────────────────▼────────────────────────▼─────────────────────────┐  │
│  │                          API LAYER (Backend Server)                              │  │
│  │                    (Likely Node.js / Express or similar)                         │  │
│  │                                                                                 │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │                              API ROUTES (~60+)                              │ │  │
│  │  │                                                                             │ │  │
│  │  │  AUTH            COMPANIES         AGENTS & CYCLES     CHAT / STREAMING     │ │  │
│  │  │  ─────           ─────────         ──────────────      ───────────────      │ │  │
│  │  │  /auth/login     /companies        /agents             /chat/conversations  │ │  │
│  │  │  /auth/register  /companies/       /operating-cycle/   /chat/proactive-     │ │  │
│  │  │  /auth/logout     can-create        settings             greeting           │ │  │
│  │  │  /auth/magic-    /company/          /cycle-config       /chat/upload         │ │  │
│  │  │   link/request    settings                              /executions/stream   │ │  │
│  │  │  /auth/session   /company/pause                         (SSE endpoint)      │ │  │
│  │  │                  /company/unpause                                            │ │  │
│  │  │                  /company/mood                                               │ │  │
│  │  │                                                                             │ │  │
│  │  │  TASKS            SUBSCRIPTION       STRIPE CONNECT    ANALYTICS            │ │  │
│  │  │  ─────            ────────────       ──────────────    ─────────            │ │  │
│  │  │  /tasks           /subscription      /stripe-connect/  /analytics/latest    │ │  │
│  │  │  /tasks/credits   /subscription/      create-account   /analytics/refresh   │ │  │
│  │  │  /tasks/recurring  add-company       /stripe-connect/  /cost-tracking/      │ │  │
│  │  │  /tasks/reorder   /subscription/      dashboard-link    summary             │ │  │
│  │  │                    create-quantity-  /stripe-connect/   /cost-tracking/      │ │  │
│  │  │                    checkout           status              by-agent           │ │  │
│  │  │                   /subscription/                        /reports/types       │ │  │
│  │  │                    customer-portal                                           │ │  │
│  │  │                   /subscription/                                             │ │  │
│  │  │                    buy-task-credits                                          │ │  │
│  │  │                                                                             │ │  │
│  │  │  OPERATIONS       DOCUMENTS          SOCIAL             TRACKING            │ │  │
│  │  │  ──────────       ─────────          ──────             ────────            │ │  │
│  │  │  /operations      /documents         /social/dashboard  /track              │ │  │
│  │  │  /operations/     /company-documents  -tweets           /track/anonymous    │ │  │
│  │  │   contribute                                            /track/device       │ │  │
│  │  │  /operations/                                           /track/page         │ │  │
│  │  │   purchase                                                                  │ │  │
│  │  │  /operations/                                                               │ │  │
│  │  │   transfer                                                                  │ │  │
│  │  │                                                                             │ │  │
│  │  │  OTHER: /dashboard  /quick-start/*  /user/*  /funding-projects  /waitlist   │ │  │
│  │  └─────────────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                                 │  │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                      AGENT ORCHESTRATION ENGINE                           │   │  │
│  │  │                                                                           │   │  │
│  │  │  ┌─────────────────────────────────────────────────────────────────────┐  │   │  │
│  │  │  │              OPERATING CYCLE (daily / weekly / manual)              │  │   │  │
│  │  │  │                                                                     │  │   │  │
│  │  │  │   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │  │   │  │
│  │  │  │   │ CEO  │ │ Eng  │ │Growth│ │Mktg  │ │Prod  │ │ Ops  │          │  │   │  │
│  │  │  │   │Agent │→│Agent │→│Agent │→│Agent │→│Agent │→│Agent │          │  │   │  │
│  │  │  │   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │  │   │  │
│  │  │  │   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                             │  │   │  │
│  │  │  │   │Sales │ │Supp  │ │Data  │ │ Cust │                             │  │   │  │
│  │  │  │   │Agent │→│Agent │→│Agent │→│Succ  │                             │  │   │  │
│  │  │  │   └──────┘ └──────┘ └──────┘ └──────┘                             │  │   │  │
│  │  │  │                                                                     │  │   │  │
│  │  │  │   Cycle: Plan → Execute tasks → Stream thinking → Log activities    │  │   │  │
│  │  │  │   Model: Claude Opus 4.6 (extended thinking enabled)                │  │   │  │
│  │  │  │   Streams: thinking_stream_delta → agent_activity → cycle_completed │  │   │  │
│  │  │  └─────────────────────────────────────────────────────────────────────┘  │   │  │
│  │  │                                                                           │   │  │
│  │  │  ┌─────────────────────────────────────────────────────────────────────┐  │   │  │
│  │  │  │                   TASK SYSTEM                                       │  │   │  │
│  │  │  │                                                                     │  │   │  │
│  │  │  │   Tasks (one-off + recurring) → prioritized by CEO agent            │  │   │  │
│  │  │  │   Tags: human, agent, engineering, growth, product, support         │  │   │  │
│  │  │  │   Credits: tiered (5/15/25/50/100/200/500/1000 per month)           │  │   │  │
│  │  │  │   Reordering, approval workflows, recurring schedules               │  │   │  │
│  │  │  └─────────────────────────────────────────────────────────────────────┘  │   │  │
│  │  └───────────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ═══════════════════════════════════ SERVICE LAYER ═══════════════════════════════    │
│                                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Anthropic   │  │   Stripe     │  │  Supabase    │  │   MCP Connections      │    │
│  │  Claude API  │  │              │  │              │  │                        │    │
│  │             │  │  Checkout    │  │  Auth (OTP)  │  │  ┌────────┐ ┌───────┐ │    │
│  │  Opus 4.6   │  │  Subscript.  │  │  Postgres DB │  │  │ GitHub │ │ Gmail │ │    │
│  │  Extended   │  │  Connect     │  │  RLS         │  │  └────────┘ └───────┘ │    │
│  │  Thinking   │  │  Portal      │  │  Storage     │  │  ┌────────┐ ┌───────┐ │    │
│  │  Streaming  │  │  Webhooks    │  │              │  │  │ Slack  │ │Twitter│ │    │
│  │             │  │              │  │              │  │  └────────┘ └───────┘ │    │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────────┘    │
│         │                │                  │                    │                    │
│  ═══════╪════════════════╪══════════════════╪════════════════════╪════════════════    │
│         │                │                  │                    │                    │
│  ┌──────▼────────────────▼──────────────────▼────────────────────▼──────────────┐    │
│  │                           DATA LAYER (Supabase Postgres)                     │    │
│  │                                                                              │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐  │    │
│  │  │  users     │ │ companies  │ │  agents    │ │  tasks     │ │ executions│  │    │
│  │  │  accounts  │ │  (multi)   │ │  configs   │ │  credits   │ │  (cycles) │  │    │
│  │  │  profiles  │ │  settings  │ │  activities│ │  recurring │ │  streams  │  │    │
│  │  │  sessions  │ │  documents │ │            │ │            │ │           │  │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └───────────┘  │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐  │    │
│  │  │  metrics / │ │subscript-  │ │conversations│ │connections │ │ cost      │  │    │
│  │  │  analytics │ │  ions      │ │  messages   │ │ (MCP/OAuth)│ │ tracking  │  │    │
│  │  │            │ │  plans     │ │  chat hist  │ │            │ │ by-agent  │  │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └───────────┘  │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                               │    │
│  │  │  funding   │ │  reports   │ │  tracking  │   + RLS policies on all       │    │
│  │  │  projects  │ │            │ │  events    │   + Indexed for perf          │    │
│  │  │  (ops)     │ │            │ │  (anon+auth│   + Service role for webhooks │    │
│  │  └────────────┘ └────────────┘ └────────────┘                               │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ═══════════════════════════════ EXTERNAL INTEGRATIONS ══════════════════════════    │
│                                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  Meta Pixel   │  │  X/Twitter   │  │   Vercel     │  │  Stripe Connect      │    │
│  │  (FB Ads      │  │  @polsiaHQ   │  │  (Hosting?)  │  │  (Creator payouts)   │    │
│  │   tracking)   │  │  @bencera_   │  │              │  │                      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────┘    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. TECH STACK BREAKDOWN

```
┌──────────────────────────────────────────────────────────────────────┐
│                        POLSIA TECH STACK                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  FRONTEND                          BACKEND (inferred)                │
│  ────────                          ───────                           │
│  React 19.x (SPA)                  Node.js (likely Express/Hono)     │
│  Vite (bundler)                    ~60+ REST API endpoints           │
│  React Router v7.13               SSE streaming (/executions/stream) │
│  Redux Toolkit + Immer            Magic link auth (email OTP)        │
│  Recharts + D3                    Session-based auth (/auth/session) │
│  react-markdown (chat render)     File uploads (/chat/upload)        │
│  canvas-confetti (celebrations)                                      │
│  CSS (custom, no Tailwind)                                           │
│                                                                      │
│  AI / LLM                          PAYMENTS                          │
│  ────────                          ────────                          │
│  Anthropic Claude API              Stripe Subscriptions              │
│  Model: Claude Opus 4.6           Stripe Connect (creator payouts)   │
│  Extended Thinking (streaming)     Stripe Customer Portal            │
│  Claude Agent SDK (per LD+JSON)    Tiered credit system              │
│  MCP tool connections              $49/mo base + add-on tiers        │
│                                                                      │
│  DATABASE                          TRACKING / ANALYTICS              │
│  ────────                          ────────────────────              │
│  Supabase (Postgres + Auth)        Meta Pixel (Facebook)             │
│  Row-Level Security (RLS)          Custom event tracking             │
│  Real-time capabilities            /track, /track/anonymous          │
│                                    /track/device, /track/page        │
│                                    Cost tracking per agent            │
│                                                                      │
│  INTEGRATIONS (MCP)                HOSTING (inferred)                │
│  ──────────────────                ───────                           │
│  GitHub                            Likely Vercel or Render           │
│  Gmail                             Static SPA + API server           │
│  Slack                             CDN for assets                    │
│  Twitter/X                         Custom domain: polsia.com         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. DATA FLOW — OPERATING CYCLE

```
                    ┌────────────────────────┐
                    │   SCHEDULE TRIGGER      │
                    │  (daily / weekly /      │
                    │   manual "Run Now")     │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  OPERATING CYCLE START  │
                    │  cycle_started event    │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   CEO AGENT PLANS      │
                    │   (Claude Opus 4.6)    │
                    │   Reviews tasks,       │
                    │   prioritizes work     │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
     ┌────────────┐    ┌────────────┐     ┌────────────┐
     │  Engineer   │    │   Growth   │     │  Marketing │    ... (all 10)
     │  Agent      │    │   Agent    │     │   Agent    │
     │             │    │            │     │            │
     │ thinking    │    │ thinking   │     │ thinking   │
     │ stream ─────┼────┼────────────┼─────┼──▶ SSE to client
     │             │    │            │     │            │
     │ activities  │    │ activities │     │ activities │
     │ ──────▶ DB  │    │ ──────▶ DB │     │ ──────▶ DB │
     └────────────┘    └────────────┘     └────────────┘
              │                 │                  │
              └─────────────────┼─────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  CYCLE COMPLETED       │
                    │  cycle_completed event  │
                    │  Update metrics         │
                    │  Log cost tracking      │
                    └────────────────────────┘
```

---

## 4. MEMORY / STATE LAYER

```
┌──────────────────────────────────────────────────────────────────┐
│                      MEMORY ARCHITECTURE                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLIENT-SIDE STATE (Redux Toolkit + Immer)                       │
│  ──────────────────────────────────────────                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Terminal State  │  │  Dashboard      │  │  Auth State    │   │
│  │  ─────────────   │  │  State          │  │  ──────────    │   │
│  │  messages[]      │  │  ──────         │  │  user          │   │
│  │  isStreaming     │  │  agents[]       │  │  session       │   │
│  │  thinkingStream  │  │  activities[]   │  │  company       │   │
│  │  conversations[] │  │  metrics{}      │  │  subscription  │   │
│  │  activeConvId    │  │  mood{}         │  │  planTier      │   │
│  └─────────────────┘  │  kpis{}         │  └────────────────┘   │
│                        │  cycleRunning   │                       │
│  ┌─────────────────┐  │  cycleProgress  │  ┌────────────────┐   │
│  │  Task State     │  └─────────────────┘  │  Settings      │   │
│  │  ──────────     │                       │  State          │   │
│  │  tasks[]        │  ┌─────────────────┐  │  ──────         │   │
│  │  recurringTasks │  │  Operations     │  │  cycleConfig   │   │
│  │  credits        │  │  State          │  │  connections[] │   │
│  │  taskTier       │  │  ──────         │  │  agentConfigs  │   │
│  └─────────────────┘  │  balance        │  └────────────────┘   │
│                        │  contributions  │                       │
│                        │  transfers      │                       │
│                        └─────────────────┘                       │
│                                                                  │
│  SERVER-SIDE PERSISTENCE (Supabase Postgres)                     │
│  ────────────────────────────────────────────                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  LONG-TERM MEMORY                                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ conversations│  │ agent_       │  │  documents   │   │    │
│  │  │ + messages   │  │ activities   │  │  (company    │   │    │
│  │  │ (chat hist)  │  │ (action log) │  │   knowledge) │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  │                                                          │    │
│  │  OPERATIONAL MEMORY                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │  tasks       │  │  metrics /   │  │  reports     │   │    │
│  │  │  (backlog +  │  │  analytics   │  │  (generated  │   │    │
│  │  │   completed) │  │  (time-ser.) │  │   insights)  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  │                                                          │    │
│  │  CONTEXT INJECTION: On each agent run, relevant          │    │
│  │  history, tasks, metrics, and docs are loaded into       │    │
│  │  the Claude prompt as context for decision-making.       │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  REAL-TIME LAYER (SSE)                                           │
│  ─────────────────────                                           │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  /api/executions/stream?companyId=...                    │    │
│  │  /api/chat/conversations/:id  (per conversation)         │    │
│  │                                                          │    │
│  │  Event types:                                            │    │
│  │  • thinking_stream_delta  (agent reasoning in real-time) │    │
│  │  • agent_activity         (agent completed an action)    │    │
│  │  • cycle_started          (operating cycle begins)       │    │
│  │  • cycle_completed        (operating cycle ends)         │    │
│  │  • thinking_stream        (thinking phase update)        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. AUTH & PAYMENT FLOW

```
┌──────────────────────────────────────────────────────────────────┐
│                     AUTH + PAYMENT FLOW                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AUTH (Supabase Magic Link)                                      │
│  ──────────────────────────                                      │
│                                                                  │
│  User ──▶ /auth/magic-link/request ──▶ Supabase sends email     │
│                                               │                  │
│  User clicks link ──▶ /auth/callback ──▶ /auth/session           │
│                                               │                  │
│                          ┌────────────────────┤                  │
│                          ▼                    ▼                  │
│                   Has company?          No company?              │
│                          │                    │                  │
│                          ▼                    ▼                  │
│                    /dashboard           /quick-start             │
│                                     (onboarding wizard)          │
│                                                                  │
│  PAYMENT (Stripe)                                                │
│  ────────────────                                                │
│                                                                  │
│  $49/mo base  ──▶  1 company + 30 night shifts + 5 task credits │
│                                                                  │
│  Add-ons:                                                        │
│  ├── Additional company slots: $49/mo each                       │
│  ├── Task credit tiers:                                          │
│  │   15 ($19) │ 25 ($29) │ 50 ($49) │ 100 ($99)                │
│  │   200 ($199) │ 500 ($499) │ 1000 ($999/mo)                  │
│  └── One-off task credit purchases                               │
│                                                                  │
│  Stripe Connect: For creator/company revenue payouts             │
│                                                                  │
│  Operations / Funding:                                           │
│  ├── /operations/contribute — community funding for AI compute   │
│  ├── /operations/purchase — buy operating cycle runs             │
│  └── /operations/transfer — transfer credits between entities    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. AGENT ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────┐
│                     AI AGENT SYSTEM                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MODEL: Claude Opus 4.6 with Extended Thinking                   │
│  SDK: Claude Agent SDK (Anthropic)                               │
│  PROTOCOL: MCP (Model Context Protocol) for tool connections     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    10 SPECIALIZED AGENTS                    │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  CEO Agent          — Strategy, OKRs, prioritization │  │  │
│  │  │  Engineer Agent     — Code, deploy, ship, iterate    │  │  │
│  │  │  Growth Agent       — Acquisition, funnels, convert  │  │  │
│  │  │  Content/Mktg Agent — Content, social, brand voice   │  │  │
│  │  │  Product Agent      — Features, roadmap, research    │  │  │
│  │  │  Operations Agent   — Process, workflow, efficiency  │  │  │
│  │  │  Sales Agent        — Outreach, leads, pipeline      │  │  │
│  │  │  Support Agent      — Tickets, FAQ, communications   │  │  │
│  │  │  Data Analyst Agent — Intel, research, analytics     │  │  │
│  │  │  Customer Success   — Retention, NPS, churn          │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  EXECUTION MODES:                                          │  │
│  │  ├── Operating Cycle (scheduled: daily/weekly/manual)      │  │
│  │  │   All agents run in sequence, CEO plans first           │  │
│  │  ├── Chat / Directive (user-initiated via terminal)        │  │
│  │  │   Route to relevant agent(s), stream response           │  │
│  │  ├── Task Execution (agent picks from task queue)          │  │
│  │  │   Credit-based, per-task billing                        │  │
│  │  └── "Run Now" (on-demand single cycle)                    │  │
│  │                                                            │  │
│  │  TOOL ACCESS (via MCP):                                    │  │
│  │  ├── GitHub: read/write repos, PRs, issues                │  │
│  │  ├── Gmail: send/read emails                               │  │
│  │  ├── Slack: post messages, read channels                   │  │
│  │  ├── Twitter/X: post tweets, read mentions                 │  │
│  │  └── Agent-specific required MCPs per config               │  │
│  │                                                            │  │
│  │  STREAMING OUTPUT:                                         │  │
│  │  ├── thinking_stream_delta (reasoning in real-time)        │  │
│  │  ├── agent_activity (completed action logged)              │  │
│  │  └── Rendered in Terminal UI with per-agent attribution    │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. COMPARISON: POLSIA.COM vs LOCAL ARCHON

```
┌──────────────────────┬─────────────────────┬─────────────────────┐
│        ASPECT        │     POLSIA.COM      │   ARCHON (local)    │
├──────────────────────┼─────────────────────┼─────────────────────┤
│ Framework            │ Vite + React SPA    │ Next.js 16 (SSR)    │
│ Router               │ React Router v7     │ App Router          │
│ State Mgmt           │ Redux Toolkit+Immer │ Zustand             │
│ Styling              │ Custom CSS          │ Tailwind CSS v4     │
│ Charts               │ Recharts + D3       │ None yet            │
│ Chat/Markdown        │ react-markdown      │ Plain text          │
│ Animations           │ canvas-confetti     │ Framer Motion       │
│ Auth                 │ Magic link + Reg    │ Magic link only     │
│ AI Model             │ Claude Opus 4.6     │ Claude Sonnet 4     │
│ Extended Thinking    │ Yes (streaming)     │ No                  │
│ MCP Connections      │ GitHub,Gmail,Slack,X│ None                │
│ Operating Cycles     │ Daily/weekly/manual │ On-demand only      │
│ Task System          │ Full (credits,recur)│ Basic               │
│ Multi-Company        │ Yes ($49/ea)        │ Single company      │
│ Stripe Connect       │ Yes (payouts)       │ No                  │
│ Cost Tracking        │ Per-agent breakdown │ None                │
│ Pricing              │ $49/mo + tiers      │ $29/$79/$199        │
│ Company Mood/ASCII   │ Yes                 │ No                  │
│ Document Storage     │ Yes                 │ No                  │
│ Public Dashboards    │ Yes (/explore)      │ Basic               │
│ Tracking/Analytics   │ Meta Pixel + custom │ None                │
│ Confetti             │ canvas-confetti     │ None                │
│ API Route Count      │ ~60+                │ ~7                  │
│ Version              │ v0.2187             │ 0.1.0               │
│ Maturity             │ Production SaaS     │ MVP prototype       │
└──────────────────────┴─────────────────────┴─────────────────────┘
```

---

## 8. KEY ARCHITECTURAL INSIGHTS

1. **Polsia is NOT built with Next.js** — it's a pure Vite + React SPA with a separate API server
2. **Agents run in loops via "operating cycles"** — scheduled daily/weekly, not just on-demand
3. **Extended thinking is a core feature** — agent reasoning streams to the client in real-time
4. **MCP (Model Context Protocol)** is how agents connect to external tools (GitHub, Gmail, etc.)
5. **Multi-company model** — users can run multiple autonomous companies simultaneously
6. **Credit-based billing** — tasks cost credits, operating cycles are "night shifts"
7. **Operations/funding model** — community can contribute to AI compute costs
8. **Stripe Connect** — for creator payouts (companies generating revenue)
9. **v0.2187** suggests ~2000+ deployments / very active iteration
10. **The local Archon project is an early-stage clone/prototype** of the Polsia concept

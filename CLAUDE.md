# Archon - Development Guidelines

## Running the Application

**Always run the dev server on port 4000:**
```bash
npm run dev -- -p 4000
```

## Color Theme

The application uses a **pure monochrome** design (black/white/gray only), matching the landing page aesthetic:

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#000000` | Pure black |
| `--foreground` | `#fafafa` | Off-white text |
| `--primary` | `#ffffff` | Active/live states (white) |
| `--accent` | `#e5e5e5` | Light gray |
| `--card` | `rgba(255,255,255,0.03)` | Glass card background |
| `--border` | `rgba(255,255,255,0.06)` | Subtle borders |
| `--muted-foreground` | `rgba(255,255,255,0.45)` | Muted text |

**Text Opacity Scale:** white/90, white/80, white/70, white/60, white/50, white/40, white/30

**Status Colors:**
- Active/Live: `#ffffff` (white) — NO green/emerald
- Warning: `#f59e0b` (amber-500)
- Danger: `#ef4444` (red-500)

**Dimension Colors (Activity Lanes ONLY):**
- BUILD: `#8b5cf6` (purple)
- INTEL: `#3b82f6` (blue) — Competitor Intelligence
- PROACTIVE: `#06b6d4` (cyan) — Proactive Measures
- GROW: `#f59e0b` (amber)
- MONETIZE: `#10b981` (teal)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for refactoring views, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw compute at it via subagents
- Let each subagent be focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user, update tasks/lessons, and fix the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Notice lessons at sesssion end and persist them

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff mentally between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- If a solution works but feels off, ask "is there a more elegant way?"
- If it feels hacky: "Knowing everything I know now, implement the elegant solution"
- Don't over-engineer for hypothetical futures
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When tests fail, diagnose and just fix it. Don't ask for hand-holding
- Print at logs, errors, failing tests — then resolve them
- Zero context switching from the user side
- Go fix failing CI tests without being told how

## Task Management
- **Create:** Write plan to tasks/todo.md with checkable items
- **Verify:** Check in before starting implementation
- **Update:** Mark tasks complete as you go
- **Explain Changes:** High-level summary at each step
- **Capture Lessons:** Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First:** Make every change as simple as possible. Import existing patterns.
- **Bug-free Default:** No happy-path only. Senior developer standards.
- **Minimalist:** Changes should only touch what's necessary. Avoid introducing bugs.

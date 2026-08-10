---
name: next-task
description: >-
  Project management copilot for the Real-Time Scheduling Platform. Use when the
  user asks exactly "Qual a próxima tarefa?" or "What's the next task?" to
  analyze code, docs, and Linear issues and recommend the next priority task
  with ready-to-use implementation prompts and model recommendations (primary
  plus, when needed, a Cursor-native Composer/Grok alternative).
---

# Next Task Copilot

When the user asks exactly **"Qual a próxima tarefa?"** or **"What's the next task?"**, execute this workflow. Do not give a generic answer.

## Mandatory Steps

### 1. Analyze Current State (Code)

Inspect what is actually implemented in the repository:

```bash
# Check repo structure
ls -la apps/ packages/ docker/ 2>/dev/null

# Check for key files
test -f docker/docker-compose.yml && echo "docker: yes" || echo "docker: no"
test -f packages/database/prisma/schema.prisma && echo "prisma: yes" || echo "prisma: no"
test -f apps/api/src/server.ts && echo "api: yes" || echo "api: no"
test -f apps/web/app/layout.tsx && echo "web: yes" || echo "web: no"
```

Also read `README.md`, `ARCHITECTURE.md`, and recent git history to understand progress.

### 2. Analyze Requirements (Documentation)

Cross-reference implemented code against:

- `README.md` — tech stack, How to Run, engineering decisions
- `ARCHITECTURE.md` — component design, data model, locking strategy, issue list

Identify gaps between documented target state and current implementation.

### 3. Align with Linear

Query the Linear project **"Real-Time Scheduling Platform"**:

1. List issues for the project (team: Breno Nery)
2. Check status: Backlog, In Progress, Done, Cancelled
3. Identify the **current active Milestone (phase)** — the earliest phase with unfinished issues
4. Respect dependency order (`blockedBy`) and prefer issues within the active phase
5. Report phase progress (e.g. "Phase 1 — 2/4 issues done")

Use Linear MCP tools: `list_issues`, `get_issue`, `list_milestones`, `get_milestone`.

**Milestones (phases):**

| Phase | Issues (Linear ID) |
|---|---|
| Phase 1 — Foundation & Data | BRE-33, BRE-34, BRE-35, BRE-44 |
| Phase 2 — Backend Core & Concurrency | BRE-36, BRE-37, BRE-41 |
| Phase 3 — Frontend & SSR Dashboard | BRE-38, BRE-40, BRE-43 |
| Phase 4 — Notifications & Delivery | BRE-45, BRE-42 |

### 4. Identify Next Priority Task

Select the highest-priority issue that:

- Is **not** Done or Cancelled
- Has all blocking dependencies completed (or is unblocked)
- Is the logical next step in the execution order

Execution order reference (live Linear IDs, from ARCHITECTURE.md):

```
Phase 1: BRE-33 → BRE-34 → BRE-35 → BRE-44
Phase 2: BRE-36 → BRE-37 → BRE-41
Phase 3: BRE-38 → BRE-40 → BRE-43
Phase 4: BRE-45 → BRE-42
```

Complete the active phase before pulling work from a later phase (unless a later-phase issue is fully unblocked and the user explicitly wants to parallelize).

### 5. Generate Execution Artifacts

Respond with this exact structure:

---

## Next Task: [Issue Title]

**Linear Issue:** [BRE-X] (link if available)  
**Milestone:** [Phase N — Name] ([X/Y issues done])  
**Priority:** [Urgent/High/Medium/Low]  
**Context:** [DevOps/Backend/Frontend/Database]

### Why This Task

[2-3 sentences explaining why this is the logical next step based on code analysis, docs, and Linear status]

### Current State vs Target

| Area | Status |
|---|---|
| [Component] | [Implemented / Partial / Not started] |

### Implementation Prompt (Primary)

Copy and paste the block below into a new Cursor chat with the **primary** model:

```
[Full, detailed prompt instructing the agent to implement the task.
Include: scope, acceptance criteria, files to create/modify,
tech constraints from README/ARCHITECTURE, and explicit "do not"
boundaries if needed.]
```

### Recommended Model (Primary)

**Model:** [model name]  
**Justification:** [1-2 sentences on why this model fits the task complexity]

### Alternative (Cursor-native: Composer or Grok)

**Cursor-native models:** Composer (e.g. Composer 2.5 Fast) and Grok (e.g. Grok 4.5).

Apply the rule below:

1. **If the primary model is already Cursor-native** (Composer or Grok):  
   Do **not** generate an alternative model or alternative prompt. State clearly that an alternative is unnecessary because the primary recommendation is already a Cursor-proprietary model.

2. **If the primary model is not Cursor-native** (e.g. Claude, GPT, or other third-party models):  
   Always recommend **one** additional Cursor-native model — choose **Composer** or **Grok** using the Alternative Model Selection Guide — and generate a **second, rewritten prompt** tailored to that model. The alternative prompt must aim for the **same function and the same quality** as the primary path.

When case 2 applies, include:

**Alternative Model:** [Composer … or Grok …]  
**Why this alternative:** [1-2 sentences: which Cursor-native strengths cover the gaps vs. the primary model]  
**How the prompt was adapted:** [1-2 sentences: what you changed in the alternative prompt so Composer/Grok can match primary quality — e.g. more explicit step order, checklists, file-by-file plan, edge-case enumeration, verification commands]

#### Alternative Implementation Prompt

Copy and paste the block below into a new Cursor chat with the **alternative** model:

```
[Rewritten prompt optimized for the chosen Composer or Grok model.
Must preserve identical scope, acceptance criteria, constraints, and
"do not" boundaries as the primary prompt. Adapt structure and
instructions so this model can reach equivalent quality — typically:
clearer sequential steps, explicit verification criteria, concrete
file paths, and enumerated edge cases. Do not dilute the task.]
```

When case 1 applies, replace the entire "Alternative (Cursor-native…)" subsection with a short note such as:

> **Alternative:** Not generated — the primary model is already Cursor-native ([Composer/Grok name]), so a second Composer/Grok path is unnecessary.

---

## Model Selection Guide

| Task Type | Recommended Model | Rationale |
|---|---|---|
| Scaffolding, config, Docker, CI | **Composer 2.5 Fast** | Fast iteration on boilerplate with low ambiguity |
| Database schema, Prisma, migrations | **Claude Sonnet 4.6 Thinking** | Strong reasoning for data modeling and constraints |
| Concurrency / locking logic | **Claude Opus 4.8 Thinking** | Deep reasoning for race conditions and transaction boundaries |
| Next.js SSR, Server Components, UI | **Claude Sonnet 4.6 Thinking** | Excellent React/Next.js patterns and component architecture |
| BullMQ, workers, async pipelines | **GPT-5.3 Codex** | Strong systems programming and queue semantics |
| Integration tests, E2E | **Claude Sonnet 4.6 Thinking** | Good at test design and edge case coverage |
| Complex multi-file refactors | **Claude Opus 4.8 Thinking** | Best for cross-cutting changes with many dependencies |

## Alternative Model Selection Guide (Cursor-native only)

Use this **only** when the primary model is **not** Composer or Grok. Pick exactly one:

| Task Type | Alternative Model | Prompt adaptation focus |
|---|---|---|
| Scaffolding, config, Docker, CI | **Composer 2.5 Fast** | Short sequential checklist; exact file paths; copy-pasteable commands |
| Database schema, Prisma, migrations | **Grok 4.5** | Explicit entity/relation table; migration safety steps; validation queries |
| Concurrency / locking logic | **Grok 4.5** | Scenario matrix (race cases); step-by-step locking protocol; failure modes |
| Next.js SSR, Server Components, UI | **Composer 2.5 Fast** | Component/file tree first; SSR vs client boundaries listed; a11y/acceptance checks |
| BullMQ, workers, async pipelines | **Grok 4.5** | Queue topology diagram in text; retry/idempotency rules; job payload contracts |
| Integration tests, E2E | **Composer 2.5 Fast** | Test cases enumerated; setup/teardown steps; expected assertions |
| Complex multi-file refactors | **Grok 4.5** | Ordered change plan per file; dependency order; post-refactor verification |

**Adaptation principles for the alternative prompt:**

- Keep the **same outcome** as the primary prompt (scope, ACs, constraints).
- Prefer **more explicit structure** (numbered steps, checklists, verification commands).
- Spell out **edge cases and "do not"** items that a stronger reasoning model might infer.
- Never ship a thinner or vaguer alternative — if anything, make it more operational.

## Important Rules

- Never recommend a task whose blockers are incomplete unless explicitly overriding with user approval.
- Always cite specific files/evidence from the codebase when describing current state.
- Both implementation prompts (primary and, when present, alternative) must be self-contained — the user should not need to add context.
- If the primary model is Composer or Grok, do not invent a redundant Cursor-native alternative.
- If all issues are Done, recommend defining the next roadmap phase or hardening tasks (auth, E2E, production deploy).
- Documentation and commit messages must remain in **English**.

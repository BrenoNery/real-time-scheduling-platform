---
name: next-task
description: >-
  Project management copilot for the Real-Time Scheduling Platform. Use when the
  user asks exactly "Qual a próxima tarefa?" or "What's the next task?" to
  analyze code, docs, and Linear issues and recommend the next priority task
  with a ready-to-use implementation prompt and model recommendation.
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

Query the Linear project **"Plataforma de Agendamentos em Tempo Real"**:

1. List issues for the project (team: Breno Nery)
2. Check status: Backlog, In Progress, Done, Cancelled
3. Respect dependency order from ARCHITECTURE.md Section 10

Use Linear MCP tools: `list_issues`, `get_issue`.

### 4. Identify Next Priority Task

Select the highest-priority issue that:

- Is **not** Done or Cancelled
- Has all blocking dependencies completed (or is unblocked)
- Is the logical next step in the execution order

Execution order reference (from ARCHITECTURE.md):

```
BRE-1 → BRE-2 → BRE-3 → (BRE-4 ∥ BRE-6) → BRE-5 → BRE-7 → BRE-8 → BRE-9 → BRE-10 → BRE-11 → BRE-12
```

### 5. Generate Execution Artifacts

Respond with this exact structure:

---

## Next Task: [Issue Title]

**Linear Issue:** [BRE-X] (link if available)  
**Priority:** [Urgent/High/Medium/Low]  
**Context:** [DevOps/Backend/Frontend/Database]

### Why This Task

[2-3 sentences explaining why this is the logical next step based on code analysis, docs, and Linear status]

### Current State vs Target

| Area | Status |
|---|---|
| [Component] | [Implemented / Partial / Not started] |

### Implementation Prompt

Copy and paste the block below into a new Cursor chat:

```
[Full, detailed prompt instructing the agent to implement the task.
Include: scope, acceptance criteria, files to create/modify,
tech constraints from README/ARCHITECTURE, and explicit "do not"
boundaries if needed.]
```

### Recommended Model

**Model:** [model name]  
**Justification:** [1-2 sentences on why this model fits the task complexity]

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

## Important Rules

- Never recommend a task whose blockers are incomplete unless explicitly overriding with user approval.
- Always cite specific files/evidence from the codebase when describing current state.
- The implementation prompt must be self-contained — the user should not need to add context.
- If all issues are Done, recommend defining the next roadmap phase or hardening tasks (auth, E2E, production deploy).
- Documentation and commit messages must remain in **English**.

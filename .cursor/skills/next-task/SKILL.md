---
name: next-task
description: >-
  Project management copilot for the Real-Time Scheduling Platform. Use when the
  user asks exactly "Qual a próxima tarefa?" or "What's the next task?" to
  analyze code, docs, and Linear issues and recommend the next priority task
  with ready-to-use implementation prompts and model recommendations (primary
  plus, when needed, a Cursor-native Composer/Grok alternative), including
  recommended effort level. Always reply to the user in Brazilian Portuguese
  (pt-BR).
---

# Next Task Copilot

When the user asks exactly **"Qual a próxima tarefa?"** or **"What's the next task?"**, execute this workflow. Do not give a generic answer.

## Language (mandatory)

- **All user-facing output from this skill MUST be in Brazilian Portuguese (pt-BR)** — headings, explanations, tables, justifications, and notes.
- Implementation prompts pasted into a new Cursor chat may remain in **English** (codebase, README, and ARCHITECTURE are in English), unless the user explicitly asks for Portuguese prompts.
- Documentation and commit messages produced by implementation work must remain in **English**.

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
5. Report phase progress (e.g. "Fase 1 — 2/4 issues concluídas")

Use Linear MCP tools: `list_issues`, `get_issue`, `list_milestones`, `get_milestone`.

**Milestones (phases):**

| Phase                                       | Issues (Linear ID)                     |
| ------------------------------------------- | -------------------------------------- |
| Phase 1 — Foundation & Data                 | BRE-33, BRE-34, BRE-35, BRE-44         |
| Phase 2 — Backend Core & Concurrency        | BRE-36, BRE-37, BRE-41                 |
| Phase 3 — Frontend & SSR Dashboard          | BRE-38, BRE-40, BRE-43                 |
| Phase 4 — Notifications & Delivery          | BRE-45, BRE-42                         |
| Phase 5 — Availability & Public Booking     | BRE-76, BRE-77, BRE-78, BRE-79, BRE-80 |

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
Phase 5: BRE-76 → (BRE-77 ∥ BRE-78) → BRE-79 → BRE-80
```

Complete the active phase before pulling work from a later phase (unless a later-phase issue is fully unblocked and the user explicitly wants to parallelize).

### 5. Generate Execution Artifacts

Respond in **pt-BR** with this exact structure:

---

## Próxima tarefa: [Issue Title]

**Issue no Linear:** [BRE-X] (link if available)  
**Milestone:** [Fase N — Nome] ([X/Y issues concluídas])  
**Prioridade:** [Urgent/High/Medium/Low]  
**Contexto:** [DevOps/Backend/Frontend/Database]

### Por que esta tarefa

[2-3 frases em pt-BR explicando por que este é o próximo passo lógico com base em código, docs e Linear]

### Estado atual vs alvo

| Área         | Status                                  |
| ------------ | --------------------------------------- |
| [Componente] | [Implementado / Parcial / Não iniciado] |

### Prompt de implementação (primário)

Copie e cole o bloco abaixo em um novo chat do Cursor com o modelo **primário** e o nível de esforço indicado:

```
[Full, detailed prompt instructing the agent to implement the task.
Include: scope, acceptance criteria, files to create/modify,
tech constraints from README/ARCHITECTURE, and explicit "do not"
boundaries if needed.]
```

### Modelo recomendado (primário)

**Modelo:** [nome do modelo]  
**Nível de esforço:** [Low / Medium / High / Extra High / N/A]  
**Justificativa:** [1-2 frases em pt-BR sobre por que o modelo e o esforço cabem na complexidade da tarefa]

### Alternativa (nativa do Cursor: Composer ou Grok)

**Modelos nativos do Cursor:** Composer (ex.: Composer 2.5 Fast) e Grok (ex.: Grok 4.5).

Aplique a regra abaixo:

1. **Se o modelo primário já for nativo do Cursor** (Composer ou Grok):  
   **Não** gere modelo alternativo nem prompt alternativo. Deixe claro, em pt-BR, que a alternativa é desnecessária porque a recomendação primária já é um modelo proprietário do Cursor. Ainda assim, indique o **nível de esforço** do modelo primário.

2. **Se o modelo primário não for nativo do Cursor** (ex.: Claude, GPT ou outros):  
   Sempre recomende **um** modelo nativo adicional — escolha **Composer** ou **Grok** pelo Alternative Model Selection Guide — e gere um **segundo prompt reescrito** para esse modelo. O prompt alternativo deve mirar a **mesma função e a mesma qualidade** do caminho primário. Inclua também o **nível de esforço** recomendado para o modelo alternativo.

Quando o caso 2 se aplicar, inclua:

**Modelo alternativo:** [Composer … ou Grok …]  
**Nível de esforço:** [Low / Medium / High / Extra High / N/A]  
**Por que esta alternativa:** [1-2 frases em pt-BR]  
**Como o prompt foi adaptado:** [1-2 frases em pt-BR sobre o que mudou para Composer/Grok atingir qualidade equivalente]

#### Prompt de implementação (alternativo)

Copie e cole o bloco abaixo em um novo chat do Cursor com o modelo **alternativo** e o nível de esforço indicado:

```
[Rewritten prompt optimized for the chosen Composer or Grok model.
Must preserve identical scope, acceptance criteria, constraints, and
"do not" boundaries as the primary prompt. Adapt structure and
instructions so this model can reach equivalent quality — typically:
clearer sequential steps, explicit verification criteria, concrete
file paths, and enumerated edge cases. Do not dilute the task.]
```

Quando o caso 1 se aplicar, substitua toda a subseção "Alternativa (nativa do Cursor…)" por uma nota curta em pt-BR, por exemplo:

> **Alternativa:** Não gerada — o modelo primário já é nativo do Cursor ([nome Composer/Grok]), então um segundo caminho Composer/Grok é desnecessário.  
> **Nível de esforço do primário:** [Low / Medium / High / Extra High / N/A]

---

## Effort Levels

Use the Cursor effort dial when the model supports it. Recommend one of:

| Nível          | Quando usar                                                                                |
| -------------- | ------------------------------------------------------------------------------------------ |
| **Low**        | Tarefas curtas, baixa ambiguidade, mudanças locais                                         |
| **Medium**     | Escopo moderado, alguns arquivos, decisões limitadas                                       |
| **High**       | Raciocínio profundo, concorrência, modelagem, refactors multiarquivo                       |
| **Extra High** | Problemas difíceis de longo curso, muitos edge cases, alto risco                           |
| **N/A**        | Modelo sem dial de esforço (ex.: Composer 2.5 Fast) — use a variante recomendada do modelo |

Always state the effort level next to every model recommendation (primary and, when present, alternative).

## Model Selection Guide

| Task Type                           | Recommended Model              | Effort         | Rationale                                                     |
| ----------------------------------- | ------------------------------ | -------------- | ------------------------------------------------------------- |
| Scaffolding, config, Docker, CI     | **Composer 2.5 Fast**          | **N/A**        | Fast iteration on boilerplate with low ambiguity              |
| Database schema, Prisma, migrations | **Claude Sonnet 4.6 Thinking** | **High**       | Strong reasoning for data modeling and constraints            |
| Concurrency / locking logic         | **Claude Opus 4.8 Thinking**   | **Extra High** | Deep reasoning for race conditions and transaction boundaries |
| Next.js SSR, Server Components, UI  | **Claude Sonnet 4.6 Thinking** | **High**       | Excellent React/Next.js patterns and component architecture   |
| BullMQ, workers, async pipelines    | **GPT-5.3 Codex**              | **High**       | Strong systems programming and queue semantics                |
| Integration tests, E2E              | **Claude Sonnet 4.6 Thinking** | **Medium**     | Good at test design and edge case coverage                    |
| Complex multi-file refactors        | **Claude Opus 4.8 Thinking**   | **Extra High** | Best for cross-cutting changes with many dependencies         |

## Alternative Model Selection Guide (Cursor-native only)

Use this **only** when the primary model is **not** Composer or Grok. Pick exactly one:

| Task Type                           | Alternative Model     | Effort         | Prompt adaptation focus                                                            |
| ----------------------------------- | --------------------- | -------------- | ---------------------------------------------------------------------------------- |
| Scaffolding, config, Docker, CI     | **Composer 2.5 Fast** | **N/A**        | Short sequential checklist; exact file paths; copy-pasteable commands              |
| Database schema, Prisma, migrations | **Grok 4.5**          | **High**       | Explicit entity/relation table; migration safety steps; validation queries         |
| Concurrency / locking logic         | **Grok 4.5**          | **Extra High** | Scenario matrix (race cases); step-by-step locking protocol; failure modes         |
| Next.js SSR, Server Components, UI  | **Composer 2.5 Fast** | **N/A**        | Component/file tree first; SSR vs client boundaries listed; a11y/acceptance checks |
| BullMQ, workers, async pipelines    | **Grok 4.5**          | **High**       | Queue topology diagram in text; retry/idempotency rules; job payload contracts     |
| Integration tests, E2E              | **Composer 2.5 Fast** | **N/A**        | Test cases enumerated; setup/teardown steps; expected assertions                   |
| Complex multi-file refactors        | **Grok 4.5**          | **Extra High** | Ordered change plan per file; dependency order; post-refactor verification         |

**Adaptation principles for the alternative prompt:**

- Keep the **same outcome** as the primary prompt (scope, ACs, constraints).
- Prefer **more explicit structure** (numbered steps, checklists, verification commands).
- Spell out **edge cases and "do not"** items that a stronger reasoning model might infer.
- Never ship a thinner or vaguer alternative — if anything, make it more operational.
- Match or slightly raise effort vs. the primary when compensating with Composer/Grok (never recommend a weaker effort for a harder task).

## Important Rules

- **Always respond to the user in Brazilian Portuguese (pt-BR).** Never switch the skill output to English unless the user explicitly requests it.
- Never recommend a task whose blockers are incomplete unless explicitly overriding with user approval.
- Always cite specific files/evidence from the codebase when describing current state.
- Both implementation prompts (primary and, when present, alternative) must be self-contained — the user should not need to add context.
- Always include the recommended **effort level** for every model suggestion.
- If the primary model is Composer or Grok, do not invent a redundant Cursor-native alternative.
- If all issues are Done, recommend defining the next roadmap phase or hardening tasks (auth, E2E, production deploy).
- Documentation and commit messages must remain in **English**.

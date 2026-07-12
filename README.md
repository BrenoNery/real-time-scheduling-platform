# Real-Time Scheduling Platform

A portfolio-grade, production-oriented scheduling platform built with TypeScript. The system demonstrates real-world engineering challenges: **Server-Side Rendering (SSR)**, **PostgreSQL concurrency control**, and **asynchronous background job processing**.

---

## Overview

This platform allows service providers to manage time slots and lets clients book appointments in real time. Two users attempting to book the same slot simultaneously must never succeed — concurrency is enforced at the database layer, not only in application logic.

### Core Capabilities

| Capability | Description |
|---|---|
| **Booking Dashboard** | SSR-powered management UI built with Next.js App Router and Server Components |
| **Concurrency-Safe Booking** | PostgreSQL row-level locking (`SELECT … FOR UPDATE`) and advisory locks |
| **Async Notifications** | BullMQ + Redis queue for confirmation emails without blocking the API |
| **Relational Data Model** | PostgreSQL managed through Prisma ORM |

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 15 (App Router), TailwindCSS, shadcn/ui | SSR/Server Components, modern React patterns, accessible UI primitives |
| **Backend** | Node.js + TypeScript + **Fastify** | High-performance HTTP server with first-class TypeScript support and a lightweight plugin ecosystem |
| **Database** | PostgreSQL 16 + Prisma ORM | ACID transactions, native locking primitives, type-safe queries |
| **Queue** | BullMQ + Redis 7 | Reliable background job processing with retries and observability |
| **Infrastructure** | Docker Compose (Mailpit) + DBngin (PostgreSQL, Redis) | Native DB services for daily dev; Docker only where needed |

> **Why Fastify over NestJS?** Fastify offers lower overhead and explicit control over request lifecycle — ideal for demonstrating transaction boundaries and locking semantics. NestJS remains a viable alternative if the project grows into a modular monolith.

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["Client Browser"]
        UI["Next.js App Router<br/>(React Server Components)"]
    end

    subgraph Frontend["Frontend — Next.js :3000"]
        SC["Server Components<br/>(SSR Data Fetching)"]
        SA["Server Actions<br/>(Mutations)"]
    end

    subgraph Backend["Backend — Fastify API :3333"]
        Routes["REST Routes"]
        BookingSvc["Booking Service"]
        LockMgr["Lock Manager<br/>(FOR UPDATE / Advisory)"]
        QueueProd["Queue Producer"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL 16<br/>Prisma ORM")]
        Redis[("Redis 7<br/>BullMQ Broker")]
    end

    subgraph Workers["Background Workers"]
        BullWorker["BullMQ Worker"]
        Mailer["Email Service<br/>(Nodemailer / Resend)"]
    end

    UI --> SC
    UI --> SA
    SC -->|"Direct DB read<br/>(Server Component)"| PG
    SA -->|"HTTP POST /api/bookings"| Routes
    Routes --> BookingSvc
    BookingSvc --> LockMgr
    LockMgr -->|"Transaction + Lock"| PG
    BookingSvc --> QueueProd
    QueueProd -->|"Enqueue job"| Redis
    Redis --> BullWorker
    BullWorker --> Mailer
    Mailer -->|"SMTP / API"| Client

    style PG fill:#336791,color:#fff
    style Redis fill:#DC382D,color:#fff
    style Frontend fill:#000,color:#fff
    style Backend fill:#68A063,color:#fff
```

For a deeper breakdown of modules, data flow, and locking strategy, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Project Structure (Planned)

```
plataforma-agendamentos/
├── apps/
│   ├── web/                  # Next.js frontend (App Router)
│   └── api/                  # Fastify backend
├── packages/
│   ├── database/             # Prisma schema, migrations, client
│   └── shared/               # Shared types, validators (Zod)
├── docker/
│   └── docker-compose.yml    # Mailpit (default); optional full profile for CI
├── README.md
├── ARCHITECTURE.md
└── .cursor/
    └── skills/
        └── next-task/        # "What's the next task?" copilot skill
```

---

## How to Run

> **Note:** Application services are not yet implemented. The commands below describe the target workflow once scaffolding is complete.

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20 with **npm** ≥ 10 (included with Node.js)
- [DBngin](https://dbngin.com/) with **PostgreSQL** and **Redis** instances running
- [Docker](https://docs.docker.com/get-docker/) ≥ 24 (Mailpit only)

#### Package manager: npm vs pnpm

**npm and pnpm are not the same tool.** Both manage dependencies, but this project uses **npm workspaces** (built into npm 7+) as the default — no extra install required if you already have Node.js.

| | npm (default) | pnpm (optional) |
|---|---|---|
| Install | Included with Node.js | `brew install pnpm` |
| Monorepo support | npm workspaces | pnpm workspaces |
| Install deps | `npm install` | `pnpm install` |
| Run script in package | `npm run dev --workspace=@repo/api` | `pnpm --filter @repo/api dev` |

pnpm is faster and more disk-efficient in large monorepos, but **you do not need to install it** unless you prefer it. All documentation uses npm commands.

### 1. Clone and configure environment

```bash
git clone https://github.com/<your-org>/plataforma-agendamentos.git
cd plataforma-agendamentos
cp .env.example .env
```

Update `.env` with your DBngin connection strings:

```bash
# .env.example (adjust ports/names to match your DBngin setup)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/plataforma_agendamentos"
REDIS_URL="redis://localhost:6379"
SMTP_HOST="localhost"
SMTP_PORT="1025"
```

### 2. Start infrastructure services

**DBngin (PostgreSQL + Redis)** — start both instances in the DBngin app before running the application.

**Mailpit (Docker)** — email capture for development:

```bash
docker compose -f docker/docker-compose.yml up -d mailpit
```

| Service | Source | URL | Purpose |
|---|---|---|---|
| PostgreSQL | DBngin | `localhost:5432` | Primary database |
| Redis | DBngin | `localhost:6379` | BullMQ broker |
| Mailpit | Docker | `http://localhost:8025` | Local email capture (dev) |

> **Alternative:** To run PostgreSQL and Redis via Docker instead of DBngin (e.g. CI or contributors without DBngin), use the optional `full` profile: `docker compose -f docker/docker-compose.yml --profile full up -d`

### 3. Run database migrations

```bash
npm run db:migrate --workspace=@repo/database
npm run db:seed --workspace=@repo/database
```

### 4. Start application services

```bash
# Terminal 1 — API
npm run dev --workspace=@repo/api

# Terminal 2 — Web
npm run dev --workspace=@repo/web

# Terminal 3 — Background worker
npm run worker:dev --workspace=@repo/api
```

### 5. Access the application

| Service | URL |
|---|---|
| Web (Dashboard) | http://localhost:3000 |
| API (Health) | http://localhost:3333/health |
| Mailpit (Dev inbox) | http://localhost:8025 |

### Full stack via Docker Compose (CI / alternative setup)

```bash
docker compose -f docker/docker-compose.yml --profile full up --build
```

---

## Engineering Decisions

### 1. Monorepo with npm workspaces

A single repository with `apps/` and `packages/` keeps the Prisma client, shared Zod schemas, and TypeScript types in sync between frontend and backend without publishing internal packages. **npm workspaces** is used by default (no extra tooling required); pnpm remains a supported alternative.

### 2. SSR via Next.js Server Components

The booking dashboard loads data directly from PostgreSQL inside Server Components — no client-side fetch waterfall, no loading spinners for initial paint. Mutations use Server Actions that delegate to the Fastify API, preserving a clear separation between read (SSR) and write (API) paths.

### 3. PostgreSQL-native concurrency control

Application-level checks (`if slot.available`) are insufficient under concurrent load. The booking flow wraps slot selection in a database transaction and acquires a row-level lock (`SELECT … FOR UPDATE`) before updating availability. Advisory locks provide an alternative for slot-range coordination when needed.

### 4. BullMQ for notification decoupling

Email delivery is slow and unreliable compared to HTTP. Enqueuing a confirmation job after a successful booking keeps API response times under 200 ms while BullMQ handles retries, dead-letter queues, and worker scaling independently.

### 5. Fastify as the API layer

Fastify's schema-based validation (via `@fastify/type-provider-typebox` or Zod) and hook system make it straightforward to enforce transaction boundaries per route. Its performance profile is well-suited for a portfolio project that needs to demonstrate low-latency booking under contention.

### 6. Hybrid local infrastructure (DBngin + Docker)

PostgreSQL and Redis run natively via **DBngin** for fast startup and easy inspection during daily development. Only **Mailpit** runs in Docker, since it has no native macOS equivalent and is lightweight to containerize. A Docker Compose `full` profile remains available for CI pipelines and contributors who prefer an all-container setup.

---

## Development Workflow

### Project Management (Linear)

All development tasks are tracked as Issues in the Linear project **[Plataforma de Agendamentos em Tempo Real](https://linear.app/breno-nery)**. Issues are categorized by context prefix:

| Prefix | Domain |
|---|---|
| `[DevOps]` | Docker, CI/CD, environment configuration |
| `[Backend]` | Fastify API, Prisma, BullMQ workers |
| `[Frontend]` | Next.js pages, components, Server Actions |
| `[Database]` | Schema design, migrations, seed data |
| `[Docs]` | Documentation and project tooling |

### "What's the next task?" Copilot

Ask exactly **"Qual a próxima tarefa?"** or **"What's the next task?"** in Cursor to trigger the project management copilot skill. It cross-references implemented code, documentation, and Linear issue status to recommend the next priority task with a ready-to-use implementation prompt.

---

## Initial Roadmap Issues

The following Issues are planned for creation in Linear upon documentation approval. See [ARCHITECTURE.md — Initial Linear Issues](./ARCHITECTURE.md#initial-linear-issues) for full descriptions and acceptance criteria.

| Priority | Issue | Context |
|---|---|---|
| 🔴 Urgent | Monorepo scaffolding & tooling setup | `[DevOps]` |
| 🔴 Urgent | Docker Compose infrastructure | `[DevOps]` |
| 🔴 Urgent | Prisma schema & initial migration | `[Database]` |
| 🟠 High | Fastify API bootstrap & health check | `[Backend]` |
| 🟠 High | PostgreSQL locking proof-of-concept | `[Backend]` |
| 🟠 High | Next.js App Router bootstrap | `[Frontend]` |
| 🟠 High | Booking dashboard (SSR) | `[Frontend]` |
| 🟡 Medium | BullMQ queue & email worker | `[Backend]` |
| 🟡 Medium | Booking API endpoints (CRUD) | `[Backend]` |
| 🟡 Medium | Server Actions integration | `[Frontend]` |
| 🟢 Low | Seed data & demo scenarios | `[Database]` |
| 🟢 Low | CI pipeline (lint, test, build) | `[DevOps]` |

---

## License

MIT

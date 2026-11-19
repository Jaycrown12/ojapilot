# OJAPILOT System Architecture

OJAPILOT is an AI-first business and inventory copilot tailored for Small and Medium Enterprises (SMEs). This document details the architectural principles, component responsibilities, security boundaries, and interaction workflows.

---

## 1. High-Level Architectural Overview

OJAPILOT adopts a **Modular Monolith** architecture for rapid iteration, operational simplicity, and strict domain boundaries.

```
+-------------------------------------------------------------+
|                     Next.js 14 Frontend                     |
|  - App Router: (auth), (dashboard)                          |
|  - Components: Copilot Chat, Inventory, Sales, Dashboard    |
|  - Client-side Supabase SDK (Anon Key + User Session JWT)   |
+------------------------------+------------------------------+
                               |
              +----------------+----------------+
              |                                 |
              v (Direct Reads via RLS)          v (API / AI Workflows via JWT)
+-----------------------------+   +-----------------------------+
|    Supabase (PostgreSQL)    |   |     FastAPI Backend Core    |
| - Row Level Security (RLS)  |<--| - JWT Auth Verification     |
| - Multi-tenant Isolation    |   | - Domain Services           |
| - Realtime Subscriptions    |   | - Agentic Copilot Workflows |
| - PostgreSQL Tables         |   | - Gemini 2.5/Flash Engine   |
+-----------------------------+   +-----------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |    Google Gemini GenAI      |
                                  | - Reasoning & Planning      |
                                  | - Inventory Forecasting     |
                                  | - Structured JSON Proposals |
                                  +-----------------------------+
```

---

## 2. Core Architectural Pillars

### A. Modular Monolith Backend
Rather than fragmenting into distributed microservices prematurely, the backend is organized into strictly decoupled domain modules inside a single FastAPI service:
- `core/`: Global settings, security, logging, and database client initialization.
- `models/` & `schemas/`: Pydantic schemas validating inbound/outbound contracts and business entities.
- `services/`: Encapsulated domain logic (Inventory, Sales, Analytics, Audit Logging).
- `ai/`: Prompt templates, function calling definitions, and LLM integrations.
- `workflows/`: Orchestration engines for multi-step AI business decisions.

### B. Security & Identity: JWT Forwarding to Supabase RLS
To guarantee robust multi-tenant data isolation and prevent privilege escalation:
1. **Authentication at Edge**: Users authenticate directly via Supabase Auth on the Next.js frontend.
2. **User JWT Propagation**: When calling the FastAPI backend, the frontend forwards the user's Supabase JWT in the `Authorization: Bearer <JWT>` header.
3. **Contextual Database Sessions**: The FastAPI backend creates user-scoped Supabase client sessions with the forwarded JWT. Every database query executes under the user's specific role and tenant ID.
4. **Row Level Security (RLS)**: The database enforces strict RLS policies at the PostgreSQL level. Even if an API service has a logical defect, the database prevents cross-tenant data leakage.
5. **Service Role Key Isolation**: Privileged operations (e.g., asynchronous maintenance, administrative aggregation) use `SUPABASE_SERVICE_ROLE_KEY` exclusively within server-side backend services—never on client endpoints.

### C. Human-in-the-Loop AI Action Proposals
AI agents in business operations must be trustworthy and predictable. OJAPILOT implements a mandatory **Human-in-the-Loop (HITL)** proposal model:
- **Zero Direct Destructive Mutates**: The AI Copilot cannot directly write destructive updates (e.g., mass price adjustments, inventory stock adjustments, order cancellations) without explicit operator authorization.
- **Proposal Lifecycle**:
  1. *Intent & Reasoning*: The user asks the Copilot (e.g., *"Restock low stock items from Supplier A"*).
  2. *Proposal Generation*: The AI engine evaluates current stock, supplier MOQ, and consumption rates, then outputs a structured `ActionProposal` stored with state `PENDING_REVIEW`.
  3. *UI Review*: The frontend renders an interactive confirmation card detailing proposed items, quantities, and cost impact.
  4. *Human Approval*: The SME operator approves, adjusts, or rejects the proposal.
  5. *Execution & Audit*: Upon approval, the backend executes the transaction and records an immutable audit trail.

---

## 3. Communication & Data Flow

| Route / Channel | Source | Target | Protocol | Security Mechanism |
|---|---|---|---|---|
| Read Queries | Frontend UI | Supabase DB | HTTPS / REST / WS | Supabase RLS via User JWT |
| AI / Business Tasks | Frontend UI | FastAPI | HTTPS REST / SSE | Bearer JWT Forwarding |
| AI Generation | FastAPI | Google Gemini | HTTPS (TLS 1.3) | Server-Side `GEMINI_API_KEY` |
| Action Execution | FastAPI | Supabase DB | HTTPS / PostgreSQL | Authenticated User Session / RLS |

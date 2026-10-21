# Ritme

> **Your work, made clear, on your terms.**  
> *The worker-owned, private, non-chat AI assistant designed specifically for neurodivergent professionals.*


---

## 💡 The Problem: The Cognitive Crisis in Knowledge Work

Modern workplaces inundate knowledge workers with scattered, ambiguous messages across Slack, Teams, email, and meetings. 

For **neurodivergent professionals** (ADHD, Autism, Executive Dysfunction), this environment presents severe friction:
- **Executive Dysfunction & Task Paralysis**: Vague requests like *"Can you take a look at the proposal by Friday?"* hide unspoken expectations and unverified assumptions.
- **Cognitive Exhaustion from Chatbots**: Most AI productivity tools rely on open-ended conversational chat interfaces that demand even *more* writing, prompt engineering, and conversational energy.
- **Loss of Trust in Autonomous Agents**: Autonomous tools often hallucinate or execute destructive updates without explicit oversight.

---

## ⚡ The Solution: A Non-Chat, Deterministic Clarity Engine

**Ritme** is a cognitive accessibility tool engineered to transform chaotic work communication into calm, structured, preference-shaped execution.

Instead of an endless chat thread, Ritme delivers a **visual, deterministic clarity loop**:

```text
Messy Work Communication (Slack, Teams, Email, Docs)
                        ↓
            Intentional Capture
                        ↓
     The Truth Board (Facts • Assumptions • Blockers)
                        ↓
       Clarify (Answer or defer blocker cards)
                        ↓
     Preference-Shaped Plan (Shaped by your focus rhythms)
                        ↓
    Deterministic Approval Gate (You hold the keys)
                        ↓
  Verified Task Execution (Created & confirmed in external tools)
                        ↓
"Something Changed" Engine (Before/After delta diffs when priorities shift)
```

---

## 🏆 Key Innovations: Why Ritme Wins

### 1. Anti-Chat Design: Cognitive Ergonomics First
Ritme replaces text-heavy conversational AI with **spatial clarity**: structured cards, interactive timelines, and clear decisions. Users never have to ask *"What should I prompt next?"*—the interface guides them through explicit, digestible steps.

### 2. The Truth Board: Dissecting Ambiguity
Ritme instantly decomposes unstructured requests into three distinct visual categories:
- 🟢 **Facts**: Explicitly confirmed requirements, deadlines, and context.
- 🟡 **Assumptions**: Unverified expectations that introduce project risks.
- 🔴 **Blockers**: Critical missing pieces that require clarification.

### 3. Neuro-Inclusive, Preference-Shaped Planning
No two brains operate the same. Ritme generates execution plans tailored directly to the worker's cognitive profile:
- Custom focus block durations (e.g., 25m sprints vs. deep work blocks).
- Built-in transition buffers to prevent context-switching fatigue.
- Energy-level curve matching (e.g., placing heavy analytical tasks during peak morning focus).

### 4. Zero Unapproved Writes & Verifiable Action
Autonomy without control is dangerous. Ritme implements an ironclad **Deterministic Approval Gate**:
- No external task, message, or calendar event is ever modified without explicit, itemized user sign-off.
- Every executed action is independently verified against destination APIs before marking it complete.

### 5. The "Something Changed" Engine
When a project deadline shifts or a scope change lands in chat, typical plans collapse. Ritme’s adaptive engine computes a clean **Before/After visual diff**, showing exactly what needs to adjust and letting the worker approve the changes with zero overwhelm.

### 6. Radical Privacy & Worker Ownership
- **You own your workspace**: Your work preferences and notes belong strictly to you—never exposed to employer tracking.
- **Privacy-by-Design**: Zero persistent retention of prompts on model servers; only allowlisted operational telemetry is stored.

---

## 🛠️ Enterprise Cloud Architecture

Ritme is engineered for reliability, scalability, and security using a modern Google Cloud and Vercel stack:

```text
┌────────────────────────────────────────────────────────┐
│                   Vercel Global Edge                   │
│         React 19 + TypeScript + Tailwind CSS           │
│        				(Client SPA)                     │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / JWT Auth
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Google Cloud Run                     │
│               FastAPI High-Performance API             │
│        (State Machines, Contract Guards, Routes)       │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
   Unix Domain Socket (Private)            │ Vertex AI API (ADC)
              ▼                            ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│     Google Cloud SQL      │ │ Google Vertex AI Engine  │
│       PostgreSQL 16       │ │      Gemini Models       │
│  (ACID, Idempotency Keys) │ │(Structured JSON Schema)  │
└───────────────────────────┘ └──────────────────────────┘
```

- **Frontend on Vercel**: Lightning-fast global delivery for the responsive Clarity Canvas.
- **Cloud Run API (`ritme-api`)**: Fully managed serverless containers scaling with zero cold-start bottlenecks.
- **Cloud SQL PostgreSQL**: Enterprise-grade relational store with strict transactional isolation and zero public internet exposure (connected via native unix domain sockets).
- **Google Vertex AI**: Powered by Gemini models leveraging structured output enforcement through Pydantic contracts and rigorous guardrails.
- **Google Secret Manager**: Zero hardcoded secrets; runtime identity managed via Application Default Credentials (ADC).

---

## 📂 System Monorepo

```text
apps/
  ├── frontend/         React 19 + Vite + Tailwind (GMera Solusi design system)
  ├── backend/          FastAPI + SQLAlchemy/Alembic (Domain engine & state machines)
  └── extension/        Chrome MV3 extension for intentional text & transcript capture
packages/
  ├── ai-engine/        Vertex AI (Gemini) integration with structured prompt guardrails
  ├── contracts/        Single source of truth Pydantic contracts → JSON Schema
  ├── api-client/       Generated TypeScript client ensuring end-to-end type safety
  └── design/           Design tokens, color semantics, and accessibility primitives
infra/                  Cloud Run, Cloud SQL, and Secret Manager deployment pipelines
docs/                   Architecture diagrams, API specs, and technical notes
evals/                  Deterministic evaluation benchmarks and safety test suites
```

---

## 🌍 The Real-World User Journey

1. **Capture**: While reading a complex project brief or confusing Slack exchange, the user highlights the text and clicks **Capture to Ritme** via the browser extension.
2. **Deconstruct**: Ritme reads the input and populates the **Truth Board** with identified facts, assumptions, and blockers.
3. **Clarify**: The user answers or defers blockers in seconds with single clicks.
4. **Plan**: Ritme synthesizes the clarified context into an actionable, realistic plan shaped around the worker's personalized focus schedule.
5. **Approve**: The user reviews each proposed action and clicks **Approve**—tasks are generated and automatically verified.
6. **Adapt**: When an urgent Slack message shifts the deadline, the user drops it into **"Something Changed"** to review the Before/After delta comparison and update their schedule calmly.

---

## 🎯 Vision & Impact

Neurodiversity is not a deficit—it is a cognitive difference that traditional corporate tools fail to accommodate. 

By eliminating the cognitive tax of open-ended conversational AI, enforcing radical privacy, and giving workers deterministic control over their plans, **Ritme transforms executive dysfunction into an organized, stress-free superpower.**

# Ritme

> **Your work, made clear, on your terms.**  
> *The worker-owned, private, non-chat AI cognitive assistant engineered specifically for neurodivergent professionals.*

[![Live App](https://img.shields.io/badge/Live%20App-ritme--sigma.vercel.app-7983ff?style=for-the-badge&logo=vercel)](https://ritme-sigma.vercel.app)
[![API Status](https://img.shields.io/badge/API%20Live-Google%20Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud)](https://ritme-api-6zc3wtcjba-et.a.run.app)
[![Database](https://img.shields.io/badge/Cloud%20SQL-PostgreSQL%2016-336791?style=for-the-badge&logo=postgresql)](https://cloud.google.com/sql)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Vertex%20AI%20%7C%20Gemini-orange?style=for-the-badge&logo=googlegemini)](https://cloud.google.com/vertex-ai)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions)](https://github.com/aadvxe/ritme/actions)

---

## 🎯 Quick Links for Judges
- **Live Frontend**: [https://ritme-sigma.vercel.app](https://ritme-sigma.vercel.app)
- **Live Cloud Run Backend**: [https://ritme-api-6zc3wtcjba-et.a.run.app](https://ritme-api-6zc3wtcjba-et.a.run.app)
- **Cloud Infrastructure**: Google Cloud Run + Google Cloud SQL (Jakarta `asia-southeast2`) + Vertex AI (`us-central1`)

---

## 💡 The Problem: The Cognitive Crisis in Modern Knowledge Work

Modern workplaces inundate knowledge workers with scattered, ambiguous messages across Slack, Teams, email, and meetings. 

For **neurodivergent professionals** (ADHD, Autism, Executive Dysfunction), this environment presents severe friction:
- **Executive Dysfunction & Task Paralysis**: Vague requests like *"Can you take a look at the proposal by Friday?"* hide unspoken expectations and unverified assumptions, causing acute mental overload and procrastination.
- **Cognitive Exhaustion from Chatbots**: Most AI productivity tools rely on open-ended conversational chat interfaces that demand even *more* writing, prompt engineering, and conversational energy. Chat is the wrong modality when executive function is already depleted.
- **Loss of Trust in Autonomous Agents**: Autonomous tools often hallucinate, send unintended emails, or make destructive updates without explicit oversight.

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
Ritme replaces text-heavy conversational AI with **spatial clarity**: structured cards, interactive timelines, and single-click decisions. Users never have to ask *"What should I prompt next?"*—the interface guides them through explicit, digestible steps with zero typing fatigue.

### 2. The Truth Board: Dissecting Ambiguity
Ritme instantly decomposes unstructured requests into three distinct visual categories:
- 🟢 **Facts**: Explicitly confirmed requirements, deadlines, and context.
- 🟡 **Assumptions**: Unverified expectations that introduce project risks.
- 🔴 **Blockers**: Critical missing pieces that require clarification.

### 3. Neuro-Inclusive, Preference-Shaped Planning
No two brains operate the same. Ritme generates execution plans tailored directly to the worker's cognitive profile:
- **Custom Focus Block Durations** (e.g., 25m sprints vs. deep work blocks).
- **Built-in Transition Buffers** to prevent context-switching fatigue.
- **Energy-Level Curve Matching** (placing heavy analytical tasks during peak morning focus).

### 4. Zero Unapproved Writes & Verifiable Action
Autonomy without control is dangerous. Ritme implements an ironclad **Deterministic Approval Gate**:
- No external task, message, or calendar event is ever modified without explicit, itemized user sign-off.
- Every executed action is independently verified against destination APIs before marking it complete.

### 5. The "Something Changed" Engine
When a project deadline shifts or a scope change lands in chat, typical plans collapse. Ritme’s adaptive engine computes a clean **Before/After visual diff**, showing exactly what needs to adjust and letting the worker approve the changes with zero overwhelm.

### 6. Radical Privacy & Worker Ownership
- **Worker-Owned Data**: Work preferences, personal rhythms, and task notes belong strictly to the individual worker—never exposed to employer surveillance or performance tracking.
- **Privacy-by-Design**: Application Default Credentials (ADC) and Google Vertex AI ensure enterprise privacy with zero prompt retention for public model training.

---

## 🛠️ Enterprise Cloud Architecture

Ritme is engineered for reliability, scalability, and security using a modern Google Cloud and Vercel stack:

```text
┌────────────────────────────────────────────────────────┐
│                   Vercel Global Edge                   │
│         React 19 + TypeScript + Tailwind CSS           │
│                       (Client SPA)                     │
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

- **Frontend on Vercel Global Edge**: Instant global delivery for the responsive Clarity Canvas with zero cold-start latency.
- **Cloud Run API (`ritme-api`)**: Fully managed serverless containers scaling with traffic, isolated inside Google Cloud's private network.
- **Cloud SQL PostgreSQL 16**: Enterprise-grade relational store with strict transactional isolation and zero public internet exposure (connected strictly via native unix domain sockets).
- **Google Vertex AI**: Powered by Gemini models leveraging structured output enforcement through Pydantic contracts and rigorous guardrails.
- **Google Secret Manager**: Zero hardcoded secrets; runtime identity managed via Application Default Credentials (ADC).
- **Automated CI/CD**: GitHub Actions pipeline triggering automated unit testing, container build via Cloud Build, database migration via Cloud Run Jobs, and production traffic rollout.

---

## 📂 System Monorepo

```text
apps/
  ├── frontend/         React 19 + Vite + TypeScript (Neuro-ergonomic design system)
  ├── backend/          FastAPI + SQLAlchemy/Alembic (Domain engine & state machines)
  └── extension/        Chrome MV3 extension for intentional text & transcript capture
packages/
  ├── ai-engine/        Vertex AI (Gemini) integration with structured prompt guardrails
  ├── contracts/        Single source of truth Pydantic contracts → JSON Schema
  ├── api-client/       Generated TypeScript client ensuring end-to-end type safety
  └── design/           Design tokens, color semantics, and accessibility primitives
infra/                  Cloud Run, Cloud SQL, and Secret Manager deployment definitions
.github/workflows/      Automated CI/CD pipeline for tests, migrations, and deployments
```

---

## 🌍 The Real-World User Journey

1. **Capture**: While reading a complex project brief or confusing Slack exchange, the user highlights the text and clicks **Capture to Ritme** via the browser extension.
2. **Deconstruct**: Ritme reads the input and populates the **Truth Board** with identified facts, assumptions, and blockers.
3. **Clarify**: The user answers or defers blockers in seconds with single clicks.
4. **Plan**: Ritme synthesizes the clarified context into an actionable, realistic plan shaped around the worker's personalized focus schedule.
5. **Approve**: The user reviews each proposed action and clicks **Approve**—tasks are generated and automatically verified.
6. **Adapt**: When an urgent message shifts the deadline, the user drops it into **"Something Changed"** to review the Before/After delta comparison and update their schedule calmly.

---

## 🎯 Vision & Impact

Neurodiversity is not a deficit—it is a cognitive difference that traditional corporate tools fail to accommodate. 

By eliminating the cognitive tax of open-ended conversational AI, enforcing radical privacy, and giving workers deterministic control over their plans, **Ritme transforms executive dysfunction into an organized, stress-free superpower.**

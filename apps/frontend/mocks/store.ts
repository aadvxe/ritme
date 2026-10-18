/**
 * In-memory fake backend state for development and tests (VITE_USE_MOCK_API=true).
 * Every record is shaped exactly like the @ritme/api-client types. Persisted to localStorage in the browser
 * so "reload and resume" works in the demo; tests pass an in-memory storage instead.
 */
import type {
  ActivityEventOut,
  CaptureOut,
  ClarificationQuestion,
  Citation,
  ConnectedDevice,
  KnowledgeDocOut,
  MeOut,
  PlanVersionOut,
  PreferencesOut,
  ProposedActionOut,
  RequirementItem,
  TaskOut,
  WorkflowSummary,
} from "@ritme/api-client";

export interface WorkflowRec {
  summary: WorkflowSummary;
  requirements: RequirementItem[];
  questions: ClarificationQuestion[];
  plans: PlanVersionOut[];
  actions: ProposedActionOut[];
  tasks: TaskOut[];
  sources: Citation[];
  /** User-editable parts of the Resume here card. */
  resumeNote: string | null;
  lastCompletedStep: string | null;
  /** ISO time analysis started; analysis completes lazily on the next read (survives reloads). */
  analyzingSince: string | null;
}

export type KnowledgeRec = KnowledgeDocOut & { content: string };

export interface MockDb {
  v: 2;
  seq: number;
  me: MeOut;
  prefs: PreferencesOut;
  captures: CaptureOut[];
  workflows: WorkflowRec[];
  knowledge: KnowledgeRec[];
  devices: ConnectedDevice[];
  activity: ActivityEventOut[];
  idempotency: Record<string, string>;
  /** What GET /api/privacy reports as the model provider. Tests change it; the default mirrors LLM_PROVIDER=fake. */
  modelProvider?: string;
}

export interface MockStorage {
  load(): string | null;
  save(value: string): void;
}

export const DEFAULT_PREFS: PreferencesOut = {
  clarificationHelp: "show_questions",
  communicationStyle: "preserve_my_voice",
  consentRecordedAt: null,
  consentVersion: null,
  informationDensity: "balanced",
  isSet: false,
  pacingSupport: "off",
  planLayout: "full_list",
  taskGranularity: "balanced",
  timeEstimates: "show",
};

const STORAGE_KEY = "ritme.mock.db.v2";

export function browserStorage(): MockStorage {
  return {
    load() {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    save(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryStorage(): MockStorage {
  let v: string | null = null;
  return { load: () => v, save: (s) => void (v = s) };
}

export const DEMO_CAPTURE_TEXT =
  "Can you get the proposal over the line by Friday? Let's make sure everyone is aligned before we send it.";
export const ONBOARDING_DOC_TITLE = "Intern Onboarding Doc";
export const PEER_REVIEW_RULE = "All client decks require a 48-hour peer review before they are sent.";

const ONBOARDING_DOC_CONTENT = `# Intern Onboarding Doc

## 1. Getting started
Ask your buddy before booking meetings with clients. Keep your calendar up to date.

## 2. Writing
Short, plain sentences work best. Lead with the decision you need.

## 3. Reviews
${PEER_REVIEW_RULE} Ask a teammate who was not involved in writing it.

## 4. Sending to clients
Send from the shared team address and copy your manager.
`;

export function nextId(db: MockDb, prefix: string): string {
  db.seq += 1;
  return `${prefix}_${String(db.seq).padStart(4, "0")}`;
}

export function emptyDb(): MockDb {
  return {
    v: 2,
    seq: 0,
    me: { id: "demo-user", displayName: "Demo User", email: "demo@ritme.local", photoUrl: null, onboardingCompleted: false },
    prefs: { ...DEFAULT_PREFS },
    captures: [],
    workflows: [],
    knowledge: [],
    devices: [],
    activity: [],
    idempotency: {},
  };
}

export function logActivity(
  db: MockDb,
  now: Date,
  workflowId: string | null,
  eventType: string,
  summary: string,
  details: Record<string, unknown> | null = null,
): void {
  db.activity.unshift({
    id: nextId(db, "act"),
    createdAt: now.toISOString(),
    workflowId,
    eventType,
    summary,
    details,
  });
}

export function addKnowledge(
  db: MockDb,
  now: Date,
  input: { title: string; content: string; sourceDate: string | null; isSeed: boolean; sourceType: KnowledgeRec["sourceType"] },
): KnowledgeRec {
  const rec: KnowledgeRec = {
    id: nextId(db, "doc"),
    title: input.title,
    content: input.content,
    chunkCount: chunkText(input.content).length,
    conflictsWith: [],
    contentHash: hash(input.content),
    createdAt: now.toISOString(),
    ingestionStatus: "ready",
    isSeed: input.isSeed,
    sourceDate: input.sourceDate,
    sourceType: input.sourceType,
  };
  // Naive conflict check: same "N-hour peer review" rule stated with a different number.
  const mine = /(\d+)-hour peer review/i.exec(input.content)?.[1];
  if (mine) {
    for (const other of db.knowledge) {
      const theirs = /(\d+)-hour peer review/i.exec(other.content)?.[1];
      if (theirs && theirs !== mine) {
        rec.conflictsWith.push(other.id);
        other.conflictsWith.push(rec.id);
      }
    }
  }
  db.knowledge.push(rec);
  return rec;
}

export function chunkText(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !/^#\s/.test(c));
}

export function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}

/** The labelled demo scenario (spec §16). Replaces any previous demo records. */
export function seedDemo(db: MockDb, now: Date): WorkflowRec {
  const oldDemo = db.workflows.filter((w) => w.summary.isDemo);
  const oldCaptureIds = new Set(oldDemo.map((w) => w.summary.captureId));
  db.workflows = db.workflows.filter((w) => !w.summary.isDemo);
  db.captures = db.captures.filter((c) => !oldCaptureIds.has(c.id));
  db.activity = db.activity.filter((a) => !oldDemo.some((w) => w.summary.id === a.workflowId));
  db.knowledge = db.knowledge.filter((k) => !k.isSeed);
  for (const k of db.knowledge) k.conflictsWith = k.conflictsWith.filter((id) => db.knowledge.some((o) => o.id === id));

  const doc = addKnowledge(db, now, {
    title: ONBOARDING_DOC_TITLE,
    content: ONBOARDING_DOC_CONTENT,
    sourceDate: "2026-09-01",
    isSeed: true,
    sourceType: "seed_demo",
  });

  const iso = now.toISOString();
  const captureId = nextId(db, "cap");
  const wfId = nextId(db, "wf");
  const capture: CaptureOut = {
    id: captureId,
    contentText: DEMO_CAPTURE_TEXT,
    createdAt: iso,
    sourceDomain: "mail.example.com",
    sourcePageTitle: "Message from your manager (demo)",
    sourceType: "seed_demo",
    sourceUrl: "https://mail.example.com/thread/proposal",
    status: "analyzed",
    title: "Proposal by Friday",
    updatedAt: iso,
    userNote: "Came in this morning. Demo input, not a real message.",
    workflowId: wfId,
  };
  db.captures.unshift(capture);

  const rec: WorkflowRec = {
    summary: {
      captureId,
      confirmedDueAt: null,
      createdAt: iso,
      currentPlanVersion: null,
      currentStep: "Read the request and found two open questions",
      id: wfId,
      isDemo: true,
      nextAction: "Answer who needs to be aligned and which Friday",
      objective: "Get the proposal ready to send, with everyone aligned",
      paused: false,
      status: "needs_input",
      title: "Get the proposal over the line (demo)",
      updatedAt: iso,
      version: 1,
    },
    requirements: [],
    questions: [],
    plans: [],
    actions: [],
    tasks: [],
    sources: [],
    resumeNote: capture.userNote,
    lastCompletedStep: "Read the request and found two open questions",
    analyzingSince: null,
  };
  applyDemoExtraction(db, rec, capture, doc);
  db.workflows.unshift(rec);
  logActivity(db, now, wfId, "capture_saved", "Saved the demo message to your Context Library");
  logActivity(db, now, wfId, "analysis_done", "Read the message: 4 items found, 2 questions need your input");
  return rec;
}

export function applyDemoExtraction(db: MockDb, rec: WorkflowRec, capture: CaptureOut, doc: KnowledgeRec | undefined): void {
  const ev = (excerpt: string) => [{ sourceId: capture.id, excerpt, startOffset: null, endOffset: null }];
  const reqs: RequirementItem[] = [
    {
      id: nextId(db, "req"),
      kind: "objective",
      text: "Get the proposal over the line",
      certainty: "explicit",
      importance: "useful",
      evidence: ev("get the proposal over the line"),
      userConfirmedAt: null,
    },
    {
      id: nextId(db, "req"),
      kind: "deliverable",
      text: "The proposal",
      certainty: "explicit",
      importance: "useful",
      evidence: ev("the proposal"),
      userConfirmedAt: null,
    },
  ];
  if (doc) {
    reqs.push({
      id: nextId(db, "req"),
      kind: "fact",
      text: "Client decks need a 48-hour peer review before they are sent",
      certainty: "explicit",
      importance: "useful",
      evidence: [{ sourceId: doc.id, excerpt: PEER_REVIEW_RULE, startOffset: null, endOffset: null }],
      userConfirmedAt: null,
    });
  }
  const deadline: RequirementItem = {
    id: nextId(db, "req"),
    kind: "deadline",
    text: "“Friday”: which Friday, and what time, is not stated",
    certainty: "unknown",
    importance: "blocking",
    evidence: ev("by Friday"),
    userConfirmedAt: null,
  };
  const aligned: RequirementItem = {
    id: nextId(db, "req"),
    kind: "acceptance_criterion",
    text: "“Everyone is aligned”: who needs to agree is not stated",
    certainty: "unknown",
    importance: "blocking",
    evidence: ev("make sure everyone is aligned"),
    userConfirmedAt: null,
  };
  const assumption: RequirementItem = {
    id: nextId(db, "req"),
    kind: "assumption",
    text: "The proposal goes to a client, so the 48-hour peer review probably applies",
    certainty: "inferred",
    importance: "useful",
    evidence: ev("before we send it"),
    userConfirmedAt: null,
  };
  reqs.push(deadline, aligned, assumption);
  rec.requirements = reqs;
  rec.questions = [
    {
      id: nextId(db, "q"),
      question: "Which Friday, and by what time, should the proposal be sent?",
      whyItMatters: "The date decides the order of the steps, including when peer review has to start.",
      blocking: true,
      relatedRequirementIds: [deadline.id],
      suggestedAnswers: ["This Friday, end of day", "This Friday, noon"],
      answer: null,
      status: "open",
    },
    {
      id: nextId(db, "q"),
      question: "Who needs to be aligned before it is sent?",
      whyItMatters: "Without names, “aligned” can't be turned into a step you can finish.",
      blocking: true,
      relatedRequirementIds: [aligned.id],
      suggestedAnswers: null,
      answer: null,
      status: "open",
    },
  ];
  rec.sources = [
    {
      sourceKind: "capture",
      sourceId: capture.id,
      chunkId: null,
      title: capture.sourcePageTitle ?? capture.title ?? "Captured text",
      excerpt: capture.contentText,
      location: null,
      sourceDate: capture.createdAt,
    },
  ];
  if (doc) {
    rec.sources.push({
      sourceKind: "knowledge",
      sourceId: doc.id,
      chunkId: `${doc.id}_chunk_3`,
      title: doc.title,
      excerpt: PEER_REVIEW_RULE,
      location: "Section 3: Reviews",
      sourceDate: doc.sourceDate,
    });
  }
}

export function createDb(storage: MockStorage, now: () => Date) {
  let db: MockDb;
  const raw = storage.load();
  try {
    db = raw ? (JSON.parse(raw) as MockDb) : (undefined as unknown as MockDb);
  } catch {
    db = undefined as unknown as MockDb;
  }
  if (!db || db.v !== 2) {
    db = emptyDb();
    seedDemo(db, now());
    storage.save(JSON.stringify(db));
  }
  return {
    get db() {
      return db;
    },
    commit() {
      storage.save(JSON.stringify(db));
    },
    /** Wipe everything (used by DELETE /privacy/account). Leaves an empty workspace. */
    wipe() {
      const me = db.me;
      db = emptyDb();
      db.me = { ...me, onboardingCompleted: true };
      storage.save(JSON.stringify(db));
    },
  };
}

export type MockStore = ReturnType<typeof createDb>;

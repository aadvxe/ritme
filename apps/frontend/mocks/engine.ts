/**
 * A deterministic stand-in for the AI engine, only used by the mock API.
 * It follows the same rules the real engine must: vague dates never become exact until the user says so,
 * explicit items always carry evidence, nothing is written without an approved action.
 */
import type {
  CaptureOut,
  PlanTaskDraft1,
  PreferencesOut,
  ProposedChange,
  RequirementItem,
  TaskOut,
} from "@ritme/api-client";
import { applyDemoExtraction, nextId, type MockDb, type WorkflowRec } from "./store";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Turn a user's answer like "this Friday, noon" into a UTC ISO time; null when it can't be done honestly. */
export function parseDeadline(answer: string, now: Date): string | null {
  const text = answer.trim().toLowerCase();
  if (!text) return null;

  const timeOf = (): [number, number] => {
    if (/\bnoon\b/.test(text)) return [12, 0];
    if (/\bmorning\b/.test(text)) return [9, 0];
    if (/\b(end of day|eod|close of business|cob)\b/.test(text)) return [17, 0];
    const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(text);
    if (m) {
      let h = Number(m[1]) % 12;
      if (m[3] === "pm") h += 12;
      return [h, Number(m[2] ?? 0)];
    }
    const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
    if (h24) return [Number(h24[1]), Number(h24[2])];
    return [17, 0];
  };

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const [h, mi] = timeOf();
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), h, mi).toISOString();
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(text)) {
      const d = new Date(now);
      const delta = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      const [h, mi] = timeOf();
      d.setHours(h, mi, 0, 0);
      return d.toISOString();
    }
  }
  if (/\btomorrow\b/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const [h, mi] = timeOf();
    d.setHours(h, mi, 0, 0);
    return d.toISOString();
  }
  return null;
}

function firstSentence(text: string): string {
  const m = /^[^.!?\n]+[.!?]?/.exec(text.trim());
  return (m?.[0] ?? text).trim().slice(0, 160);
}

/** Fill a freshly captured workflow with an extraction. The demo message gets the labelled demo extraction. */
export function runExtraction(db: MockDb, rec: WorkflowRec, capture: CaptureOut, now: Date): void {
  const text = capture.contentText;
  const doc = db.knowledge.find((k) => /peer review/i.test(k.content));
  if (/proposal/i.test(text) && /friday/i.test(text)) {
    applyDemoExtraction(db, rec, capture, doc);
    rec.summary.objective = "Get the proposal ready to send, with everyone aligned";
  } else {
    const ev = (excerpt: string) => [{ sourceId: capture.id, excerpt, startOffset: null, endOffset: null }];
    const objective = firstSentence(text);
    const reqs: RequirementItem[] = [
      {
        id: nextId(db, "req"),
        kind: "objective",
        text: objective,
        certainty: "explicit",
        importance: "useful",
        evidence: ev(objective),
        userConfirmedAt: null,
      },
    ];
    const questions: WorkflowRec["questions"] = [];
    const vague = /\b(soon|asap|when you can|next week|this week|tomorrow|eod|end of (day|week)|(mon|tues|wednes|thurs|fri|satur|sun)day)\b/i.exec(text);
    if (vague) {
      const d: RequirementItem = {
        id: nextId(db, "req"),
        kind: "deadline",
        text: `“${vague[0]}” is not a date Ritme can plan around`,
        certainty: "unknown",
        importance: "blocking",
        evidence: ev(vague[0]),
        userConfirmedAt: null,
      };
      reqs.push(d);
      questions.push({
        id: nextId(db, "q"),
        question: "What date and time does this need to be done by?",
        whyItMatters: "A real date decides the order and spacing of the steps.",
        blocking: true,
        relatedRequirementIds: [d.id],
        suggestedAnswers: null,
        answer: null,
        status: "open",
      });
    }
    const who = /\b(everyone|aligned|approve|approval|sign.?off|stakeholders?)\b/i.exec(text);
    if (who) {
      const a: RequirementItem = {
        id: nextId(db, "req"),
        kind: "acceptance_criterion",
        text: `“${who[0]}”: who is involved is not stated`,
        certainty: "unknown",
        importance: "blocking",
        evidence: ev(who[0]),
        userConfirmedAt: null,
      };
      reqs.push(a);
      questions.push({
        id: nextId(db, "q"),
        question: "Who needs to agree or approve before this is done?",
        whyItMatters: "Without names, this can't become a step you can finish.",
        blocking: true,
        relatedRequirementIds: [a.id],
        suggestedAnswers: null,
        answer: null,
        status: "open",
      });
    }
    rec.requirements = reqs;
    rec.questions = questions;
    rec.sources = [
      {
        sourceKind: "capture",
        sourceId: capture.id,
        chunkId: null,
        title: capture.sourcePageTitle ?? capture.title ?? "Captured text",
        excerpt: text.slice(0, 400),
        location: null,
        sourceDate: capture.createdAt,
      },
    ];
    rec.summary.objective = objective;
  }
  const open = rec.questions.filter((q) => q.status === "open" && q.blocking).length;
  rec.summary.status = open > 0 ? "needs_input" : "planning";
  rec.summary.currentStep = `Read the request and found ${open} open question${open === 1 ? "" : "s"}`;
  rec.lastCompletedStep = rec.summary.currentStep;
  rec.summary.nextAction = open > 0 ? "Answer the open questions" : "Create a plan";
  rec.analyzingSince = null;
  capture.status = "analyzed";
  capture.updatedAt = now.toISOString();
}

/* ------------------------------------------------------------------------------------------ plan */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

interface PlanSeed {
  title: string;
  description: string;
  done: string;
  minutes: number;
  /** days before the deadline */
  offsetDays: number;
  rationale: string;
}

const SMALL: PlanSeed[] = [
  { title: "List who needs to agree on the proposal", description: "Write the names down in one place.", done: "A list of names is saved with the proposal.", minutes: 10, offsetDays: 4, rationale: "“Everyone aligned” needs real names." },
  { title: "Draft the outline of the proposal", description: "Headings only. Do not fill in the text yet.", done: "The outline has every section heading.", minutes: 15, offsetDays: 4, rationale: "An outline makes the writing smaller." },
  { title: "Write the first full draft", description: "Fill in each section from your outline.", done: "Every section has text, even if rough.", minutes: 45, offsetDays: 3, rationale: "A rough draft is enough to start review." },
  { title: "Send the draft for peer review", description: "Ask a teammate who did not write it.", done: "A reviewer has the draft and a date to reply.", minutes: 10, offsetDays: 2, rationale: "Your Intern Onboarding Doc asks for 48 hours of peer review before client decks go out." },
  { title: "Apply the review comments", description: "Go through each comment once.", done: "Each comment is applied or answered.", minutes: 30, offsetDays: 1, rationale: "Closes the review loop before sending." },
  { title: "Check everyone on your list has agreed, then send", description: "Confirm with each person, then send.", done: "Everyone on the list has agreed and the proposal is sent.", minutes: 15, offsetDays: 0, rationale: "This is the actual goal." },
];
const BALANCED: PlanSeed[] = [
  { title: "List who needs to agree and outline the proposal", description: "Names first, then headings.", done: "Names listed and an outline written.", minutes: 25, offsetDays: 4, rationale: "Gets the shape clear early." },
  { title: "Write the first full draft", description: "Fill in each section from your outline.", done: "Every section has text.", minutes: 45, offsetDays: 3, rationale: "A rough draft is enough to start review." },
  { title: "Send for peer review and apply comments", description: "Review needs 48 hours, so send it early.", done: "Comments applied or answered.", minutes: 40, offsetDays: 2, rationale: "Your Intern Onboarding Doc asks for 48 hours of peer review." },
  { title: "Check everyone has agreed, then send", description: "Confirm with each person, then send.", done: "Everyone agreed and the proposal is sent.", minutes: 15, offsetDays: 0, rationale: "This is the actual goal." },
];
const LARGE: PlanSeed[] = [
  { title: "Write the proposal and get it reviewed", description: "Outline, draft, and send for peer review.", done: "A reviewed draft exists.", minutes: 120, offsetDays: 2, rationale: "Review needs 48 hours." },
  { title: "Get agreement and send", description: "Confirm with everyone involved, then send.", done: "Everyone agreed and the proposal is sent.", minutes: 30, offsetDays: 0, rationale: "This is the actual goal." },
  { title: "Wrap up", description: "File the final version and note anything to repeat next time.", done: "The final version is filed.", minutes: 10, offsetDays: 0, rationale: "Leaves a clean record." },
];

function genericSeeds(objective: string): PlanSeed[] {
  return [
    { title: `Write down what “done” looks like for: ${objective.slice(0, 60)}`, description: "One or two sentences.", done: "A clear finish line is written.", minutes: 10, offsetDays: 3, rationale: "A clear finish line makes the rest smaller." },
    { title: "Do the first piece of the work", description: "Start with the part you understand best.", done: "The first piece is finished.", minutes: 30, offsetDays: 2, rationale: "Starting small builds momentum without pressure." },
    { title: "Finish the rest and check it against the finish line", description: "Compare with what you wrote in step 1.", done: "It matches what you wrote in step 1.", minutes: 30, offsetDays: 0, rationale: "Closes the loop." },
  ];
}

export function buildPlanTasks(rec: WorkflowRec, prefs: PreferencesOut, now: Date): PlanTaskDraft1[] {
  const isProposal = /proposal/i.test(rec.summary.title + rec.summary.objective);
  let seeds: PlanSeed[];
  if (isProposal) seeds = prefs.taskGranularity === "small_steps" ? SMALL : prefs.taskGranularity === "larger_blocks" ? LARGE : BALANCED;
  else seeds = genericSeeds(rec.summary.objective ?? rec.summary.title);

  const due = rec.summary.confirmedDueAt ? new Date(rec.summary.confirmedDueAt) : null;
  // Never date a step before tomorrow morning.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return seeds.map((sd, i) => {
    let dueAt: string | null = null;
    if (due) {
      const t = new Date(due.getTime() - sd.offsetDays * DAY);
      dueAt = new Date(Math.min(due.getTime(), Math.max(t.getTime(), tomorrow.getTime()))).toISOString();
    }
    return {
      draftId: `d${i + 1}`,
      title: sd.title,
      description: sd.description,
      definitionOfDone: sd.done,
      estimatedMinutes: sd.minutes,
      dueAt,
      dependsOnDraftIds: i === 0 ? [] : [`d${i}`],
      requirementIds: rec.requirements.slice(0, 2).map((r) => r.id),
      rationale: sd.rationale,
    };
  });
}

/* --------------------------------------------------------------------------------------- replan */

export interface ReplanResult {
  diff: ProposedChange[];
  blastRadiusTaskIds: string[];
  updates: { taskId: string; before: { dueAt: string | null; title: string }; after: { dueAt: string | null; title: string } }[];
  newConfirmedDueAt: string | null | undefined;
}

export function computeReplan(
  rec: WorkflowRec,
  req: { trigger: "request_changed" | "could_not_work"; newDueAt?: string | null; newText?: string | null },
  now: Date,
): ReplanResult {
  const open = rec.tasks.filter((t) => t.status !== "done" && t.status !== "skipped");
  const done = rec.tasks.filter((t) => t.status === "done" || t.status === "skipped");
  const diff: ProposedChange[] = [];
  const updates: ReplanResult["updates"] = [];
  const blast: string[] = [];

  const keep = (t: TaskOut, reason: string) =>
    diff.push({ changeType: "keep", existingTaskId: t.id, before: { title: t.title, dueAt: t.dueAt }, after: { title: t.title, dueAt: t.dueAt }, reason });

  for (const t of done) keep(t, "Already finished, so it stays exactly as it is.");

  let newConfirmed: string | null | undefined;
  const sorted = [...open].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));

  if (req.trigger === "request_changed" && req.newDueAt) {
    newConfirmed = req.newDueAt;
    const target = new Date(req.newDueAt).getTime();
    const oldDeadline = rec.summary.confirmedDueAt ? new Date(rec.summary.confirmedDueAt).getTime() : null;
    for (const t of sorted) {
      const oldDue = t.dueAt ? new Date(t.dueAt).getTime() : null;
      let nextDue: number;
      if (oldDeadline !== null && oldDue !== null) {
        nextDue = Math.max(oldDue - (oldDeadline - target), now.getTime() + DAY / 2);
        nextDue = Math.min(nextDue, target);
      } else {
        nextDue = target;
      }
      const after = { title: t.title, dueAt: new Date(nextDue).toISOString() };
      if (after.dueAt === t.dueAt) {
        keep(t, "The new deadline doesn't change this one.");
      } else {
        blast.push(t.id);
        updates.push({ taskId: t.id, before: { title: t.title, dueAt: t.dueAt }, after });
        diff.push({
          changeType: "update",
          existingTaskId: t.id,
          before: { title: t.title, dueAt: t.dueAt },
          after,
          reason: oldDeadline !== null && target < oldDeadline ? "The deadline moved earlier, so this step moves earlier too." : "The deadline moved, so this step's date moves with it.",
        });
      }
    }
  } else {
    // "I couldn't work on this": replan remaining work from today. No reason needed, no judgement.
    const deadline = rec.summary.confirmedDueAt ? new Date(rec.summary.confirmedDueAt).getTime() : null;
    const start = now.getTime() + DAY;
    sorted.forEach((t, i) => {
      if (deadline === null || deadline <= start) {
        keep(t, deadline === null ? "There is no confirmed date, so nothing is rescheduled." : "The deadline is close, so this stays for you to decide.");
        return;
      }
      const span = deadline - start;
      const next = new Date(start + (span * (i + 1)) / sorted.length).toISOString();
      if (next === t.dueAt) {
        keep(t, "Already fits the remaining time.");
        return;
      }
      blast.push(t.id);
      updates.push({ taskId: t.id, before: { title: t.title, dueAt: t.dueAt }, after: { title: t.title, dueAt: next } });
      diff.push({
        changeType: "update",
        existingTaskId: t.id,
        before: { title: t.title, dueAt: t.dueAt },
        after: { title: t.title, dueAt: next },
        reason: "Remaining work is spread evenly from tomorrow to the deadline.",
      });
    });
  }
  if (req.newText) {
    diff.push({ changeType: "keep", existingTaskId: null, before: null, after: { note: req.newText }, reason: "Your new wording is saved with the workflow." });
  }
  return { diff, blastRadiusTaskIds: blast, updates, newConfirmedDueAt: newConfirmed };
}

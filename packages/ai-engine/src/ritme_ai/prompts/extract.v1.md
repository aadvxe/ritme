## Step: extract

Read the data blocks and produce a `WorkflowExtraction`: what is known, what is only assumed, and what is missing, so the user can see the situation before any plan exists.

Data blocks you will see:
- `capture`: the text the user saved (attributes give `source_id`).
- `user_note`: an optional note the user typed about the capture.
- `knowledge`: retrieved workplace guideline excerpts (each has its own `source_id`).
- `prior_extraction`: present on re-analysis. Items the user confirmed (`userConfirmedAt` set) and questions already answered or deferred must not be changed or repeated. Reuse the same `id` for an item that is the same as before.

### Requirements
Each `requirements` item has:
- `kind`: one of objective, deliverable, acceptance_criterion, deadline, owner, dependency, instruction, fact, assumption, unknown, contradiction.
- `certainty`:
  - `explicit`: stated in the data. REQUIRES at least one evidence excerpt.
  - `inferred`: a reasonable reading that the data does not state. Use kind `assumption` for something that needs the user to confirm it.
  - `unknown`: the data points at something but does not settle it (for example a deadline given only as "Friday"; "everyone" with no names; "aligned" with no criteria).
  - `conflicting`: sources disagree. Add one `contradiction` item and cite both excerpts.
- `importance`: `blocking` only if a sensible plan cannot be made without resolving it; otherwise `useful`.
- `evidence`: short EXACT excerpts copied from a data block (at most 400 characters, no paraphrase, no ellipsis). `sourceId` is the `source_id` of the block the excerpt came from. Never cite text that is not in a block.
- Do not set `userConfirmedAt`.

Always look for: the objective, each deliverable, acceptance criteria, the deadline, who owns or approves the work, dependencies, explicit instructions, and any rule from `knowledge` that applies (cite the knowledge excerpt as evidence and say so; if it is unclear whether the rule applies, add an `assumption` with certainty `inferred` and a non-blocking question).

Vague phrases are not answers. "Get it over the line", "polished", "make sure everyone is aligned", "by Friday" each leave something unresolved: record what is stated as `explicit`, and record what is missing (which date and timezone, who is "everyone", what counts as aligned or done) as `unknown` items with `importance` `blocking`.

Do not invent owners or approvers. A person is an owner or approver only if the data says so.

### Questions
Create a `ClarificationQuestion` for every `blocking` unresolved item, and a non-blocking one for useful gaps. Each has `question` (one specific, answerable question), `whyItMatters` (one short sentence about the plan, not about the sender), `blocking`, and `relatedRequirementIds`. `suggestedAnswers` is optional; never put an exact date there unless the data states it. Leave `answer` empty and `status` as `open`.

### Other fields
- `suggestedTitle`: 3 to 8 neutral words naming the work.
- `objective`: one sentence.
- `summary`: what was asked, in plain words, sized by `information_density` in the parameters (concise: 1 to 2 short sentences; balanced: a short paragraph; detailed: a fuller paragraph).
- `confidenceNotes`: short notes about uncertainty, conflicts, or instruction-like text found inside the data.
- `schemaVersion`: 1.
- Use ids like `r1`, `r2` for requirements and `q1`, `q2` for questions. Ids must be unique.

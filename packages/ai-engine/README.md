# ritme-ai-engine (`ritme_ai`)

Stateless Python library the backend calls **in-process**. It turns captured text into a Truth Board
extraction, plans, replans, clarification drafts and a collaboration guide, using Gemini on Vertex AI
(or a deterministic fake). No database, no HTTP framework, no backend imports. It depends on
`ritme-contracts` only.

## Use

```python
from ritme_ai import Engine, EngineError
from ritme_contracts import (
    ExtractInput,
    PlanInput,
    ReplanInput,
    DraftClarificationInput,
    CollabGuideInput,
)

engine = Engine.from_env()  # LLM_PROVIDER=fake|vertex, see below
try:
    extraction, meta = await engine.run(ExtractInput(...))  # -> (WorkflowExtraction, StepMeta)
except EngineError as exc:  # exc.kind: timeout | rate_limit | invalid_output | provider
    ...  # exc.retryable; the message never contains source text
```

`Engine.run` dispatches on the input type and returns `(output, StepMeta)`; store `StepMeta`
(`step`, `prompt_version`, `model`, `attempts`, `repaired`) on the agent run.

| Input | Output | Model (env) |
|---|---|---|
| `ExtractInput` | `WorkflowExtraction` | `LLM_MODEL_FAST` |
| `PlanInput` | `WorkflowPlanDraft` | `LLM_MODEL_PLAN` |
| `ReplanInput` | `WorkflowPlanDraft` with `proposed_changes` (Before/After) | `LLM_MODEL_PLAN` |
| `DraftClarificationInput` | `DraftClarification` | `LLM_MODEL_FAST` |
| `CollabGuideInput` | `CollabGuideOutput` | `LLM_MODEL_FAST` |

`ritme_ai.explain_adaptations(preferences)` returns the plain-language "Because you selected ..."
lines for the plan UI.

## Environment variables

Names only; values belong in the environment or a local `.env` (never committed).

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `fake` | `fake` (no GCP, deterministic) or `vertex` |
| `GCP_PROJECT_ID` | none | Required when `LLM_PROVIDER=vertex` |
| `VERTEX_LOCATION` | `us-central1` | Where inference runs (verify model availability there) |
| `LLM_MODEL_FAST` | `gemini-3.1-flash-lite` | extract, draft_clarification, collab_guide |
| `LLM_MODEL_PLAN` | `gemini-3.1-flash-lite` | plan, replan |
| `LLM_TIMEOUT_MS` | `30000` | Per model call (the schema-repair retry gets its own timeout) |

Authentication is **Application Default Credentials only**. There is no API-key path and no
service-account JSON in env; `google.auth.default()` credentials are passed to the client
explicitly, so a stray API-key environment variable cannot switch the adapter into key mode.

## Layout

```
src/ritme_ai/
  engine.py        Engine.run(step_input) -> (output, StepMeta)
  config.py        EngineConfig.from_env()
  blocks.py        <parameters> (trusted) and <<<UNTRUSTED_DATA>>> (data) rendering/parsing
  schemas.py       flat model-output schemas for plan/replan
  llm/             LlmAdapter interface, Result/LlmError, repair loop, vertex.py, fake.py, fixtures.py
  steps/           extract, plan, replan, draft_clarification, collab_guide
  prompts/         policy.v1.md + <step>.v1.md (versioned; the id e.g. "extract.v2" goes in StepMeta)
  guards/          dates, evidence, injection, attribution, communication, graph, preferences,
                   extraction, plan, replan
```

How the pieces enforce the spec:

- **Policy-only system prompt.** It contains the shared policy, the step prompt and a
  `<parameters>` JSON (explicit preferences, date, timezone, code-computed values). Captured text,
  notes, retrieved chunks and anything derived from them go only into `untrusted_input`, each inside a
  `<<<UNTRUSTED_DATA name=...>>>` block whose delimiter sequences are neutralised in the content.
- **One repair retry.** Invalid JSON, a Pydantic validation error (explicit without evidence, cycles,
  duplicate ids), or a semantic check (too many tasks for the granularity, masking advice) is sent
  back once with an input-free error list. A second failure is `invalid_output`. Timeouts, rate limits
  and provider errors are not retried here (the orchestrator decides).
- **Guards run after the model, always.** Vague dates never become exact dates (deadline becomes
  `unknown` + blocking question); explicit requires evidence that really occurs in the sources
  (excerpts are re-anchored with offsets, unfindable ones dropped); no owners/emotion/intent from
  tone; instruction-like capture text is never promoted to a requirement; task due dates only from
  user-confirmed dates; estimates hidden when `time_estimates=hide`; granularity, density and layout
  mapping; dependency/cycle validation; replans can only change the code-computed blast radius and
  never completed tasks; communication guardrails (no masking advice, no diagnosis labels, hedged
  "Possible interpretation" notes, safe template fallback).

## Chat and email transcripts

Captures may be transcripts from WhatsApp, Telegram, Teams, Slack, Gmail or Outlook (first line
`Chat: <title> (<App>)`, then `[time] Sender: message`; a plain selection may have no header). The
`extract.v2` prompt and `guards/transcript.py` treat them as attributed untrusted data: requests and
deadlines are attributed to the sender who wrote them (name in the requirement text, evidence is the
exact message excerpt), a first-person commitment ("I'll review it") becomes a fact about that sender
rather than a task, small talk yields nothing, owners/approvers stay unknown unless a message says so,
and a note records that the conversation does not say which participant is the user. `extract.v1`
stays in the repo for reproducing old runs.

## Tests

```bash
uv run pytest packages/ai-engine
uv run ruff check packages/ai-engine
uv run lint-imports
```

No network or GCP is needed. `FakeLlm` answers every step from fixtures, including the seeded demo
(manager message about the proposal by Friday plus the Intern Onboarding Doc 48-hour peer-review rule:
"Friday" and "everyone is aligned" come back as blocking questions). Tests script exact model
responses with `FakeLlm().script(EngineStep.PLAN, ...)` and inspect `llm.calls`.

The fixtures play a deliberately naive model (they call "Friday" explicit, copy injected sentences,
print estimates) so the tests prove the guards, not the fixtures.

## Live Vertex call

Not verified in this repository: `gcloud` is not installed on the build machine and no live call has
been made. To try one yourself:

```bash
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com --project <your-project>
```

```powershell
$env:LLM_PROVIDER = "vertex"
$env:GCP_PROJECT_ID = "<your-project>"
$env:VERTEX_LOCATION = "us-central1"
uv run python -c "import asyncio; from ritme_ai import Engine; from ritme_contracts import *; e = Engine.from_env(); print(asyncio.run(e.run(ExtractInput(capture_id='c1', content_text='Can you get the proposal over the line by Friday?', preferences=Preferences(), context=StepContext(today='2026-10-19')))))"
```

Things to check on the first live run: the model name is available in `VERTEX_LOCATION`, and Vertex
accepts the generated `response_schema` (the google-genai SDK converts the Pydantic models offline;
the service side has not been exercised). If the service rejects a schema, simplify it in
`ritme_ai/schemas.py` or the contracts rather than loosening validation: the server re-validates
every response regardless.

## Notes for the contracts owner

- Model-output schemas for plan/replan live in `ritme_ai/schemas.py` (flat, no open dicts) because
  `ProposedChange.before/after` are `dict[str, Any]`; the engine builds `proposed_changes` itself.
- `ExtractInput.prior` merge relies on `RequirementItem.user_confirmed_at` and answered/deferred
  `ClarificationQuestion`s; ids should stay stable across runs.

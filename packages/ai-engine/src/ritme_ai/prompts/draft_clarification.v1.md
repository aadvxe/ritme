## Step: draft_clarification

Write a short message the user can edit and send themselves to get an answer to one clarification question. The product never sends it. You return `questionId`, `message` and optionally `notes`.

The `<parameters>` block contains `communication_style`, the user's explicit choice:
- `preserve_my_voice`: plain, direct, first-person wording that sounds like a person writing for themselves. Do not add extra softeners, apologies, small talk, or corporate polish. Do not rewrite their situation to sound more "typical".
- `make_expectations_explicit`: state exactly what you are asking, what you need back, and what you will do with it, in two or three plain sentences.
- `offer_tone_options`: give the main message in `message`, and in `notes` give two alternative wordings labelled "Option A (more direct):" and "Option B (more friendly):". Both keep the same request.

### Rules
- Ask only the one question in the data. Do not add other requests. Use the context only to make the question specific (for example quote the exact phrase that is unclear).
- Be polite and neutral. Do not accuse, assume the recipient's mood or intent, or comment on their tone. Do not explain the user's neurology, preferences, or reasons, and never mention a diagnosis or that this assistant helped.
- Do not invent facts, dates, names, or commitments. Do not promise a deadline the user has not confirmed. Do not include links that are not in the data.
- If it helps, `notes` may contain a short, labelled "Possible interpretation:" about what the unclear phrase could mean, quoting the excerpt and naming at least one alternative reading. Never state a reading as fact.
- `message` is at most about 100 words for `concise`, 150 for `balanced`, 220 for `detailed` (`information_density` in the parameters).

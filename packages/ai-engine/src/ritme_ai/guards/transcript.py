"""Chat / email transcripts: attributed, untrusted data.

Captured transcripts look like

    Chat: Deck review (Microsoft Teams)
    [10:41] Priya: I'll review it after lunch.
    [10:44] Marcus Lee: Can you send the deck by Friday?

(the header and timestamps may be missing for a plain selection). Rules enforced here:

* every request or deadline is attributed to the sender whose message states it, only as stated;
* a first-person commitment ("I'll review it") is that sender's own statement, never a task for
  the user; who the user is in the conversation is unknown unless the data says so;
* nothing is inferred about a sender's emotion, intent or approval (see `attribution`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ritme_contracts import Importance, RequirementItem, RequirementKind

_HEADER = re.compile(r"^\s*(?:Chat|Email|Thread|Conversation)\s*:\s*(?P<title>.*?)\s*$", re.I)
_MESSAGE = re.compile(
    r"^\[(?P<time>[^\]\n]{1,40})\]\s*(?P<sender>[^:\n\[\]]{1,80}?)\s*:\s?(?P<body>.*)$"
)
_COMMITMENT = re.compile(
    r"^\s*(?:i'?ll|i\s+will|i\s+can|i'?m\s+going\s+to|i\s+am\s+going\s+to|let\s+me|we'?ll|we\s+will)\b",
    re.IGNORECASE,
)
# Kinds that read as "someone must do this" and therefore need a named requester.
_REQUEST_KINDS = {
    RequirementKind.OBJECTIVE,
    RequirementKind.DELIVERABLE,
    RequirementKind.ACCEPTANCE_CRITERION,
    RequirementKind.DEADLINE,
    RequirementKind.DEPENDENCY,
    RequirementKind.INSTRUCTION,
    RequirementKind.OWNER,
}
_NOT_A_TASK = {
    RequirementKind.OBJECTIVE,
    RequirementKind.DELIVERABLE,
    RequirementKind.ACCEPTANCE_CRITERION,
    RequirementKind.DEPENDENCY,
    RequirementKind.INSTRUCTION,
}


@dataclass(frozen=True, slots=True)
class Message:
    start: int  # offset of the message line in the capture text
    end: int  # offset just after the message (including continuation lines)
    body_start: int
    time: str
    sender: str


@dataclass(frozen=True, slots=True)
class Transcript:
    title: str | None
    messages: tuple[Message, ...]

    @property
    def senders(self) -> list[str]:
        return list(dict.fromkeys(m.sender for m in self.messages))

    def message_at(self, offset: int) -> Message | None:
        return next((m for m in self.messages if m.start <= offset < m.end), None)


def parse_transcript(text: str) -> Transcript | None:
    """Return the parsed transcript, or None when the text is not a message list."""
    title: str | None = None
    messages: list[Message] = []
    pos = 0
    current: dict[str, object] | None = None
    for line in text.splitlines(keepends=True):
        stripped = line.rstrip("\r\n")
        m = _MESSAGE.match(stripped)
        if m:
            if current:
                messages.append(Message(end=pos, **current))  # type: ignore[arg-type]
            current = {
                "start": pos,
                "body_start": pos + m.start("body"),
                "time": m["time"].strip(),
                "sender": m["sender"].strip(),
            }
        elif not messages and current is None and (h := _HEADER.match(stripped)):
            title = h["title"] or None
        pos += len(line)
    if current:
        messages.append(Message(end=pos, **current))  # type: ignore[arg-type]
    return Transcript(title, tuple(messages)) if messages else None


def is_commitment(body: str) -> bool:
    return bool(_COMMITMENT.match(body))


def attribute_requirement(
    req: RequirementItem, transcript: Transcript, content_text: str
) -> RequirementItem:
    """Name the sender behind a request, and keep commitments out of the user's task list."""
    anchor = next(
        (
            (e, transcript.message_at(e.start_offset))
            for e in req.evidence
            if e.start_offset is not None and transcript.message_at(e.start_offset)
        ),
        None,
    )
    if anchor is None:
        return req
    ev, msg = anchor
    assert msg is not None
    body = content_text[msg.body_start : msg.end].strip()
    update: dict[str, object] = {}
    if req.kind in _NOT_A_TASK and is_commitment(body):
        # The sender says what THEY will do. That is a fact about them, not a request to the user.
        update = {
            "kind": RequirementKind.FACT,
            "text": f'{msg.sender} said: "{ev.excerpt.strip()}"',
            "importance": Importance.USEFUL,
        }
    elif req.kind in _REQUEST_KINDS and msg.sender.casefold() not in req.text.casefold():
        update["text"] = f"{req.text.rstrip()} (from {msg.sender})"
    return req.model_copy(update=update) if update else req


NOTE_WHO_IS_YOU = (
    "This is a conversation with several people. It does not say which one is you, so requests "
    "are attributed to the person who wrote them."
)

"""Context Library: ingest, chunk, lexical (Postgres full-text) retrieval with resolvable citations.

Retrieval is scoped to the authenticated user's own documents (spec §15). Seed documents are inserted
per user by the demo seed, so another user's content can never be returned.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime

from ritme_contracts import (
    Citation,
    IngestionStatus,
    KnowledgeDocCreate,
    KnowledgeDocOut,
    KnowledgeSourceType,
)
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import models as m
from ..errors import conflict
from ..repos import log_event

MAX_CHUNK_CHARS = 700


def chunk_text(content: str) -> list[tuple[str, str]]:
    """Split into paragraph/heading-aware chunks. Returns (text, location) pairs.

    Chunk text is the exact excerpt later cited, so it is never rewritten.
    """
    blocks = [b.strip() for b in re.split(r"\n\s*\n", content.replace("\r\n", "\n")) if b.strip()]
    chunks: list[tuple[str, str]] = []
    heading = ""
    for block in blocks:
        first = block.splitlines()[0]
        if first.lstrip().startswith("#"):
            heading = first.lstrip("# ").strip()
        pieces = [block] if len(block) <= MAX_CHUNK_CHARS else _split_long(block)
        for piece in pieces:
            loc = f"Section: {heading}" if heading else f"Part {len(chunks) + 1}"
            chunks.append((piece, loc))
    return chunks


def _split_long(block: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", block)
    out: list[str] = []
    cur = ""
    for s in sentences:
        if cur and len(cur) + len(s) + 1 > MAX_CHUNK_CHARS:
            out.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return out


def content_hash(content: str) -> str:
    return hashlib.sha256(content.strip().encode()).hexdigest()


def doc_out(d: m.KnowledgeDocument, chunk_count: int) -> KnowledgeDocOut:
    return KnowledgeDocOut(
        id=d.id,
        title=d.title,
        source_type=KnowledgeSourceType(d.source_type),
        ingestion_status=IngestionStatus(d.ingestion_status),
        content_hash=d.content_hash,
        chunk_count=chunk_count,
        source_date=d.source_date,
        is_seed=d.is_seed,
        conflicts_with=[],
        created_at=d.created_at,
    )


def add_document(
    session: Session,
    user_id: uuid.UUID,
    body: KnowledgeDocCreate,
    *,
    is_seed: bool = False,
) -> KnowledgeDocOut:
    doc = m.KnowledgeDocument(
        user_id=user_id,
        title=body.title,
        source_type=body.source_type.value,
        content_hash=content_hash(body.content),
        content_text=body.content,
        ingestion_status=IngestionStatus.PENDING.value,
        is_seed=is_seed,
        source_date=body.source_date,
    )
    try:
        with session.begin_nested():
            session.add(doc)
            session.flush()
    except IntegrityError:
        raise conflict("You already added a document with this exact content.") from None
    chunks = chunk_text(body.content)
    for i, (txt, loc) in enumerate(chunks):
        session.add(m.KnowledgeChunk(document_id=doc.id, user_id=user_id, chunk_index=i, text=txt, location=loc))
    doc.ingestion_status = IngestionStatus.READY.value
    session.flush()
    log_event(session, user_id, "knowledge_added", "A document was added to your Context Library.", details={"documentId": str(doc.id)})
    return doc_out(doc, len(chunks))


def list_documents(session: Session, user_id: uuid.UUID) -> list[KnowledgeDocOut]:
    counts = dict(
        session.execute(
            select(m.KnowledgeChunk.document_id, func.count()).where(m.KnowledgeChunk.user_id == user_id).group_by(m.KnowledgeChunk.document_id)
        ).all()
    )
    docs = session.scalars(
        select(m.KnowledgeDocument).where(m.KnowledgeDocument.user_id == user_id).order_by(m.KnowledgeDocument.created_at.desc())
    ).all()
    return [doc_out(d, counts.get(d.id, 0)) for d in docs]


def search(
    session: Session,
    user_id: uuid.UUID,
    query: str,
    document_ids: list[uuid.UUID] | None = None,
    limit: int = 5,
) -> list[Citation]:
    """Lexical search. Every result resolves to a stored chunk and its exact excerpt."""
    cleaned = re.sub(r"[^\w\s-]", " ", query).strip()
    if not cleaned:
        return []
    sql = """
        SELECT c.id, c.document_id, c.text, c.location, d.title, d.source_date,
               ts_rank(c.tsv, q.query) AS rank
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c.document_id
        , websearch_to_tsquery('english', :q) AS q(query)
        WHERE c.user_id = :uid AND d.user_id = :uid AND c.tsv @@ q.query
    """
    params: dict[str, object] = {"q": _or_query(cleaned), "uid": user_id, "lim": limit}
    if document_ids:
        sql += " AND c.document_id = ANY(:docs)"
        params["docs"] = list(document_ids)
    sql += " ORDER BY rank DESC, c.chunk_index LIMIT :lim"
    rows = session.execute(text(sql), params).all()
    return [
        Citation(
            source_id=str(r.document_id),
            source_kind="knowledge",
            title=r.title,
            chunk_id=str(r.id),
            excerpt=r.text,
            location=r.location,
            source_date=r.source_date if isinstance(r.source_date, datetime) else None,
        )
        for r in rows
    ]


_STOP = {"the", "a", "an", "to", "of", "and", "or", "for", "in", "on", "is", "are", "be", "we", "you", "it", "this", "that", "can", "get", "by", "before", "send"}


def _or_query(cleaned: str) -> str:
    """OR the meaningful words so a long captured sentence still finds a relevant chunk."""
    words = [w for w in re.findall(r"[\w-]+", cleaned.lower()) if len(w) > 2 and w not in _STOP]
    return " OR ".join(dict.fromkeys(words)) or cleaned

import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Skeleton, Textarea, toast } from "@ritme/design";
import type { CaptureOut, KnowledgeDocOut } from "@ritme/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, QueryBoundary } from "@/components/ui/feedback";
import { IconAlert, IconBook, IconCheckCircle, IconClock, IconDoc, IconTrash, IconUpload } from "@/components/ui/icons";
import { PageHeader, Section } from "@/components/ui/page";
import { isTextFile } from "@/features/capture/PasteCapture";
import { describeError, useApi } from "@/lib/api";
import { formatDateOnly, formatUpdated } from "@/lib/dates";
import { readFileText } from "@/lib/files";
import { qk, useCaptures, useKnowledge, useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";

const L = s.library;

/** The list endpoint may include the document text (the mock does); when it does not, say so. */
const textOf = (d: KnowledgeDocOut): string | null => {
  const c = (d as KnowledgeDocOut & { content?: unknown }).content;
  return typeof c === "string" ? c : null;
};

function DocCard({ doc, all, onDelete }: { doc: KnowledgeDocOut; all: KnowledgeDocOut[]; onDelete: () => void }) {
  const full = textOf(doc);
  const conflicts = doc.conflictsWith.map((id) => all.find((d) => d.id === id)?.title).filter(Boolean) as string[];
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-card" data-testid="doc-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-navy">
          <span className="text-primary-strong"><IconBook /></span>
          {doc.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {doc.isSeed && <Badge tone="info">{L.seed}</Badge>}
          <Badge tone={doc.ingestionStatus === "ready" ? "fact" : doc.ingestionStatus === "failed" ? "error" : "neutral"} icon={doc.ingestionStatus === "ready" ? <IconCheckCircle /> : doc.ingestionStatus === "failed" ? <IconAlert /> : <IconClock />}>
            {doc.ingestionStatus === "ready" ? L.activeGrounding : L.ingestion[doc.ingestionStatus]}
          </Badge>
        </div>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {L.addedOn(formatDateOnly(doc.createdAt))} · {doc.sourceDate ? L.sourceDate(formatDateOnly(doc.sourceDate)) : L.noSourceDate} · {L.chunks(doc.chunkCount)}
      </p>
      <div
        role="region"
        tabIndex={0}
        aria-label={L.fullTextOf(doc.title)}
        className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-background p-3 text-sm text-text"
        data-testid="doc-text"
      >
        {full ?? <span className="text-text-secondary">{L.noFullText}</span>}
      </div>
      {conflicts.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-assumption/30 p-2 text-sm text-assumption-fg" data-testid="doc-conflict">
          <span className="mt-0.5"><IconAlert /></span>
          <span>
            <span className="font-semibold">{L.conflict}: </span>
            {L.conflictBody(conflicts.map((c) => `“${c}”`).join(", "))}
          </span>
        </p>
      )}
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`${L.deleteDoc}: ${doc.title}`}>
          <IconTrash /> {s.common.delete}
        </Button>
      </div>
    </li>
  );
}

function CaptureCard({ cap, onDelete }: { cap: CaptureOut; onDelete: () => void }) {
  const [show, setShow] = useState(false);
  const title = cap.title ?? cap.sourcePageTitle ?? L.noTitle;
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-card" data-testid="capture-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-navy">
          <span className="text-primary-strong"><IconDoc /></span>
          {title}
        </h3>
        {cap.sourceType === "seed_demo" && <Badge tone="info">{s.common.demo}</Badge>}
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {L.capturedOn(formatUpdated(cap.createdAt))}
        {cap.sourceDomain && ` · ${cap.sourceDomain}`}
      </p>
      <p className={`mt-2 text-sm text-text ${show ? "" : "line-clamp-2"}`}>{cap.contentText}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShow((v) => !v)} aria-expanded={show}>
          {show ? L.hideText : L.viewText}
        </Button>
        {cap.workflowId && (
          <Button asChild variant="soft" size="sm">
            <Link to={`/workflows/${cap.workflowId}`}>{L.openWorkflowFromCapture}</Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`${L.deleteCapture}: ${title}`}>
          <IconTrash /> {s.common.delete}
        </Button>
      </div>
    </li>
  );
}

function AddDocumentModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [fromFile, setFromFile] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.knowledge.create({
        title: title.trim(),
        content,
        sourceDate: date || null,
        sourceType: fromFile ? "user_markdown" : "user_text",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.knowledge });
      await qc.invalidateQueries({ queryKey: qk.privacy });
      toast.success(L.docAdded);
      setTitle("");
      setContent("");
      setDate("");
      setFromFile(false);
      onOpenChange(false);
    },
  });

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isTextFile(file.name)) return setProblem(s.dashboard.capture.dropBad);
    setProblem(null);
    setContent(await readFileText(file));
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
    setFromFile(/\.(md|markdown)$/i.test(file.name));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void loadFile(e.dataTransfer.files[0]);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={L.addGuidelineTitle}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {s.common.cancel}
          </Button>
          <Button type="submit" form="add-doc-form" loading={create.isPending}>
            {L.guidelineSave}
          </Button>
        </>
      }
    >
      <form
        id="add-doc-form"
        className="space-y-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !content.trim()) return setProblem("A title and some text are both needed.");
          setProblem(null);
          create.mutate();
        }}
      >
        <Field label={L.docTitleLabel} htmlFor="doc-title">
          <Input id="doc-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={L.docContentLabel} htmlFor="doc-content" hint={L.drop}>
          <Textarea id="doc-content" rows={8} value={content} onChange={(e) => setContent(e.target.value)} required />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={L.docDateLabel} htmlFor="doc-date" hint={L.docDateHint}>
            <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <IconUpload /> {L.drop}
          </Button>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown" className="sr-only" tabIndex={-1} aria-label={L.drop} onChange={(e) => void loadFile(e.target.files?.[0])} />
        </div>
        {problem && <Alert tone="error" title={problem} />}
        {create.isError && <Alert tone="error" title={s.common.unknownError}>{describeError(create.error)}</Alert>}
      </form>
    </Modal>
  );
}

function SearchDocs() {
  const api = useApi();
  const [q, setQ] = useState("");
  const search = useMutation({ mutationFn: (query: string) => api.knowledge.search({ query }) });
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) search.mutate(q.trim());
        }}
      >
        <Field label={L.searchLabel} htmlFor="doc-search" className="min-w-[14rem] flex-1">
          <Input id="doc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.searchPlaceholder} />
        </Field>
        <Button type="submit" variant="outline" loading={search.isPending}>
          {L.search}
        </Button>
      </form>
      {search.isError && <Alert tone="error" title={s.common.unknownError}>{describeError(search.error)}</Alert>}
      {search.data && (
        <div aria-live="polite">
          {search.data.results.length === 0 ? (
            <p className="text-sm text-text-secondary">{L.searchNone}</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-navy">{L.searchResults}</h3>
              <ul className="mt-2 space-y-2">
                {search.data.results.map((r) => (
                  <li key={`${r.sourceId}-${r.chunkId}`} className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-medium text-navy">{r.title}</p>
                    <p className="text-xs text-text-secondary">{r.location ?? L.noLocation}</p>
                    <blockquote className="mt-1 border-l-2 border-primary/40 pl-3 text-text-secondary">{r.excerpt}</blockquote>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function GuidelinesPage() {
  const api = useApi();
  const qc = useQueryClient();
  const refresh = useRefreshWorkflowData();
  const captures = useCaptures();
  const docs = useKnowledge();
  const [adding, setAdding] = useState(false);
  const [delDoc, setDelDoc] = useState<KnowledgeDocOut | null>(null);
  const [delCap, setDelCap] = useState<CaptureOut | null>(null);

  const removeDoc = useMutation({
    mutationFn: (id: string) => api.knowledge.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.knowledge });
      await qc.invalidateQueries({ queryKey: qk.privacy });
      toast.success(L.deleted);
      setDelDoc(null);
    },
  });
  const removeCap = useMutation({
    mutationFn: (id: string) => api.captures.remove(id),
    onSuccess: async () => {
      await refresh();
      toast.success(L.deleted);
      setDelCap(null);
    },
  });

  return (
    <div className="rt-stack">
      <PageHeader title={L.pageTitle} description={L.pageSubtitle} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-navy">{L.heading}</h2>
        <Button onClick={() => setAdding(true)}>{L.addGuideline}</Button>
      </div>

      <Section title={L.searchCardTitle} id="search">
        <SearchDocs />
      </Section>

      <QueryBoundary query={docs} skeleton={<Skeleton className="h-32 w-full" />}>
        {(list) => (
          <Section title={L.activeDocs(list.length)} id="docs">
            {list.length === 0 ? (
              <EmptyState title={L.docsEmpty} description={L.docsEmptyBody} icon={<IconBook className="h-6 w-6" />} action={<Button onClick={() => setAdding(true)}>{L.addGuideline}</Button>} />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {list.map((d) => (
                  <DocCard key={d.id} doc={d} all={list} onDelete={() => setDelDoc(d)} />
                ))}
              </ul>
            )}
          </Section>
        )}
      </QueryBoundary>

      <Section title={L.capturesTitle} id="captures">
        <QueryBoundary query={captures} skeleton={<Skeleton className="h-32 w-full" />}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState title={L.capturesEmpty} description={L.capturesEmptyBody} icon={<IconDoc className="h-6 w-6" />} />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {list.map((c) => (
                  <CaptureCard key={c.id} cap={c} onDelete={() => setDelCap(c)} />
                ))}
              </ul>
            )
          }
        </QueryBoundary>
      </Section>

      <AddDocumentModal open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={delDoc !== null}
        onOpenChange={(o) => !o && setDelDoc(null)}
        title={L.deleteDocTitle}
        description={L.deleteDocBody}
        confirmLabel={L.deleteDoc}
        danger
        loading={removeDoc.isPending}
        onConfirm={() => delDoc && removeDoc.mutate(delDoc.id)}
      />
      <ConfirmDialog
        open={delCap !== null}
        onOpenChange={(o) => !o && setDelCap(null)}
        title={L.deleteCaptureTitle}
        description={L.deleteCaptureBody}
        confirmLabel={L.deleteCapture}
        danger
        loading={removeCap.isPending}
        onConfirm={() => delCap && removeCap.mutate(delCap.id)}
      />
    </div>
  );
}

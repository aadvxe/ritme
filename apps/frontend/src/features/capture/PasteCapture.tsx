import { Alert, Button, Field, Input, Textarea, toast } from "@ritme/design";
import type { CaptureSourceType } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { IconUpload } from "@/components/ui/icons";
import { describeError, useApi } from "@/lib/api";
import { readFileText } from "@/lib/files";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";

export const MAX_CAPTURE_CHARS = 20_000;
const MAX_FILE_BYTES = 200_000;

export const isTextFile = (name: string) => /\.(txt|md|markdown)$/i.test(name);

/** F14: website fallback capture. Paste text or drop a .txt/.md file. Nothing is sent until Save. */
export function PasteCapture() {
  const api = useApi();
  const navigate = useNavigate();
  const refresh = useRefreshWorkflowData();
  const fileRef = useRef<HTMLInputElement>(null);
  // One key per draft: retrying after a failure can never create a second capture.
  const keyRef = useRef<string>(crypto.randomUUID());
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [fromFile, setFromFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const type: CaptureSourceType = fromFile ? "upload" : "manual_text";
      const res = await api.captures.create({
        contentText: text,
        idempotencyKey: keyRef.current,
        sourceType: type,
        sourceUrl: null,
        sourceDomain: null,
        sourcePageTitle: null,
        title: title.trim() || null,
        userNote: note.trim() || null,
      });
      // Creating a capture never claims analysis finished: ask for it explicitly.
      if (res.workflow.status === "captured") await api.captures.analyze(res.capture.id);
      return res;
    },
    onSuccess: async (res) => {
      toast.success(s.dashboard.capture.saved);
      keyRef.current = crypto.randomUUID();
      setText("");
      setTitle("");
      setNote("");
      setFromFile(false);
      await refresh();
      navigate(`/workflows/${res.workflow.id}`);
    },
  });

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!isTextFile(file.name)) return setProblem(s.dashboard.capture.dropBad);
    if (file.size > MAX_FILE_BYTES) return setProblem(s.dashboard.capture.dropTooBig);
    setText(await readFileText(file));
    setTitle((t) => t || file.name.replace(/\.[^.]+$/, ""));
    setFromFile(true);
    toast.message(s.dashboard.capture.fileLoaded(file.name));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files[0]);
  };

  const submit = () => {
    setProblem(null);
    if (!text.trim()) return setProblem(s.dashboard.capture.empty);
    if (text.length > MAX_CAPTURE_CHARS) return setProblem(s.dashboard.capture.tooLong(MAX_CAPTURE_CHARS));
    save.mutate();
  };

  const c = s.dashboard.capture;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
      aria-label={c.title}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p className="text-sm text-text-secondary">{c.intro}</p>

      <div className={dragging ? "rounded-xl ring-2 ring-primary-strong" : ""}>
        <Field label={c.textLabel} htmlFor="capture-text" hint={dragging ? c.dropActive : c.drop}>
          <Textarea
            id="capture-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (problem) setProblem(null);
            }}
            placeholder={c.textPlaceholder}
            rows={5}
            aria-describedby="capture-text-hint"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <IconUpload /> {c.drop}
        </Button>
        <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="sr-only" tabIndex={-1} aria-label={c.drop} onChange={(e) => void loadFile(e.target.files?.[0])} />
        <span className="text-xs text-text-secondary" aria-live="polite">
          {text.length.toLocaleString()} / {MAX_CAPTURE_CHARS.toLocaleString()}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${c.titleLabel}`} htmlFor="capture-title">
          <Input id="capture-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={`${c.noteLabel}`} htmlFor="capture-note">
          <Input id="capture-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <p className="text-xs text-text-secondary">{c.privacy}</p>

      {problem && <Alert tone="error" title={problem} />}
      {save.isError && (
        <Alert tone="error" title={c.failedTitle}>
          {describeError(save.error)} {c.failedBody}
        </Alert>
      )}

      <Button type="submit" loading={save.isPending}>
        {save.isPending ? c.saving : c.save}
      </Button>
    </form>
  );
}

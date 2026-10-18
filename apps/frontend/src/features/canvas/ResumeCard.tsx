import { Button, Field, Input, Modal, toast } from "@ritme/design";
import type { WorkflowDetail } from "@ritme/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { WorkflowStatusBadge } from "@/components/ui/status";
import { IconLink } from "@/components/ui/icons";
import { Section } from "@/components/ui/page";
import { describeError, useApi } from "@/lib/api";
import { useRefreshWorkflowData } from "@/lib/queries";
import { s } from "@/i18n";

const R = s.canvas.resume;

/**
 * F21: built only from saved workflow state, never from watching activity. The next action is editable.
 * (The contract has no field for editing the capture note, so the note is shown read-only.)
 */
export function ResumeCard({ detail, disabled }: { detail: WorkflowDetail; disabled: boolean }) {
  const api = useApi();
  const refresh = useRefreshWorkflowData();
  const { resume, workflow } = detail;
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState(resume.nextAction ?? "");

  const save = useMutation({
    mutationFn: () => api.workflows.patch(workflow.id, { version: workflow.version, nextAction: next.trim() }),
    onSuccess: async () => {
      await refresh(workflow.id);
      setEditing(false);
      toast.success(R.saved);
    },
  });

  const row = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{value}</dd>
    </div>
  );

  return (
    <Section
      title={R.title}
      description={R.intro}
      id="resume"
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setNext(resume.nextAction ?? "");
            setEditing(true);
          }}
        >
          {R.edit}
        </Button>
      }
      className="border-primary/30 bg-primary/5"
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="resume-card">
        {row(
          R.source,
          resume.sourceTitle ? (
            resume.sourceUrl ? (
              <a href={resume.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-strong hover:underline">
                <IconLink /> {resume.sourceTitle}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              resume.sourceTitle
            )
          ) : (
            R.sourceNone
          ),
        )}
        {row(R.note, resume.userNote ?? <span className="text-text-secondary">{R.noteNone}</span>)}
        {row(R.status, <WorkflowStatusBadge status={resume.status} paused={workflow.paused} />)}
        {row(R.lastStep, resume.lastCompletedStep ?? <span className="text-text-secondary">{R.lastStepNone}</span>)}
        {row(R.nextAction, resume.nextAction ?? <span className="text-text-secondary">{R.nextActionNone}</span>)}
        {row(
          R.openQuestions,
          resume.openQuestionCount > 0 ? (
            <a href="#truth-board" className="font-medium text-primary-strong hover:underline">
              {R.openQuestionsCount(resume.openQuestionCount)}
            </a>
          ) : (
            R.openQuestionsCount(0)
          ),
        )}
      </dl>

      <Modal
        open={editing}
        onOpenChange={setEditing}
        title={R.editTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {s.common.cancel}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!next.trim()}>
              {s.common.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={R.nextLabel} htmlFor="resume-next">
            <Input id="resume-next" autoFocus value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          {save.isError && <p role="alert" className="text-sm text-error-fg">{describeError(save.error)}</p>}
        </div>
      </Modal>
    </Section>
  );
}

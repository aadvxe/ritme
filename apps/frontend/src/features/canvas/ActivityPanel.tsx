import { Button, Skeleton } from "@ritme/design";
import { ErrorPanel } from "@/components/ui/feedback";
import { Section } from "@/components/ui/page";
import { ActivityList } from "@/features/activity/ActivityList";
import { useWorkflowActivity } from "@/lib/queries";
import { s } from "@/i18n";

const A = s.canvas.activity;

/** F25: concise summaries and tool outcomes only. */
export function ActivityPanel({ workflowId }: { workflowId: string }) {
  const q = useWorkflowActivity(workflowId);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Section title={s.canvas.headings.activity} description={A.intro} id="activity">
      {q.isPending ? (
        <div role="status" aria-label={A.loading}>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : q.isError ? (
        <ErrorPanel error={q.error} onRetry={() => void q.refetch()} compact />
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">{A.empty}</p>
      ) : (
        <div className="space-y-3">
          <ActivityList items={items} />
          {q.hasNextPage && (
            <Button variant="outline" size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
              {A.loadMore}
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

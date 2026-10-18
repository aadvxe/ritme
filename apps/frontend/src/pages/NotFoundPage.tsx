import { Button, EmptyState } from "@ritme/design";
import { Link } from "react-router-dom";
import { s } from "@/i18n";
import { useDocumentTitle } from "@/components/ui/feedback";

export function NotFoundPage() {
  useDocumentTitle("Not found");
  return (
    <EmptyState
      title={s.common.notFoundTitle}
      description={s.common.notFoundBody}
      action={
        <Button asChild>
          <Link to="/">{s.common.goToDashboard}</Link>
        </Button>
      }
    />
  );
}

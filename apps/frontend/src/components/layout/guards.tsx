import { Skeleton } from "@ritme/design";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/queries";
import { ErrorPanel } from "@/components/ui/feedback";

function FullPageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-3xl space-y-4 p-8">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** F2: route guard. Signed-out visitors go to /login and come back to where they were headed. */
export function RequireAuth() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <FullPageSkeleton />;
  if (status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: `${loc.pathname}${loc.search}` }} />;
  }
  return <Outlet />;
}

/** First run: send people who haven't finished or skipped setup to the working-style questionnaire. */
export function RequireOnboarded() {
  const me = useMe();
  if (me.isPending) return <FullPageSkeleton />;
  if (me.isError) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorPanel error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!me.data.onboardingCompleted) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

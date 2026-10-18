import { PageHeader } from "@/components/ui/page";
import { CalendarOverview } from "@/features/calendar/CalendarOverview";
import { s } from "@/i18n";

/** Full-page version of the calendar overview (the same one embedded on the Dashboard). */
export function CalendarPage() {
  return (
    <div className="rt-stack">
      <PageHeader title={s.calendar.title} description={s.calendar.intro} />
      <CalendarOverview />
    </div>
  );
}

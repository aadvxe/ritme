import { SegmentedContent, SegmentedList, SegmentedTabs, SegmentedTrigger } from "@ritme/design";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/page";
import { s } from "@/i18n";
import { DevicesTab } from "./DevicesTab";
import { PrivacyTab } from "./PrivacyTab";
import { DisplayTab } from "./DisplayTab";
import { WorkingStyleTab } from "./WorkingStyleTab";

const TABS = [
  { value: "working-style", label: s.settings.tabs.workingStyle, el: <WorkingStyleTab /> },
  { value: "display", label: s.settings.tabs.display, el: <DisplayTab /> },
  { value: "devices", label: s.settings.tabs.devices, el: <DevicesTab /> },
  { value: "privacy", label: s.settings.tabs.privacy, el: <PrivacyTab /> },
];

function SettingsLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = TABS.find((t) => pathname.endsWith(`/${t.value}`)) ?? TABS[0]!;
  return (
    <div className="rt-stack">
      <PageHeader title={s.settings.pageTitle} />
      <SegmentedTabs value={current.value} onValueChange={(v) => navigate(`/settings/${v}`)}>
        <SegmentedList aria-label={s.settings.tablist}>
          {TABS.map((t) => (
            <SegmentedTrigger key={t.value} value={t.value}>
              {t.label}
            </SegmentedTrigger>
          ))}
        </SegmentedList>
        {TABS.map((t) => (
          <SegmentedContent key={t.value} value={t.value} className="mt-6 outline-none">
            {t.value === current.value ? t.el : null}
          </SegmentedContent>
        ))}
      </SegmentedTabs>
    </div>
  );
}

export function SettingsPage() {
  return (
    <Routes>
      <Route index element={<Navigate to="working-style" replace />} />
      <Route path="working-style" element={<SettingsLayout />} />
      <Route path="display" element={<SettingsLayout />} />
      <Route path="devices" element={<SettingsLayout />} />
      <Route path="privacy" element={<SettingsLayout />} />
      <Route path="*" element={<Navigate to="/settings/working-style" replace />} />
    </Routes>
  );
}

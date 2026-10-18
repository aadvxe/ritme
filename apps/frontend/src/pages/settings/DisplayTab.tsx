import { Button } from "@ritme/design";
import { useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice";
import { Section } from "@/components/ui/page";
import { DEFAULT_DISPLAY, readDisplay, saveDisplay, type DisplaySettings } from "@/lib/display";
import { s } from "@/i18n";

const opts = <T extends string>(o: Record<T, string>) => (Object.keys(o) as T[]).map((value) => ({ value, label: o[value] }));

/** F7: text size, spacing and a reduce-motion override. They only change data attributes on <html>. */
export function DisplayTab() {
  const [d, setD] = useState<DisplaySettings>(() => readDisplay());
  const update = (patch: Partial<DisplaySettings>) => {
    const next = { ...d, ...patch };
    setD(next);
    saveDisplay(next);
  };
  const d0 = s.display;
  return (
    <div className="rt-stack">
      <p className="max-w-2xl text-sm text-text-secondary">{d0.intro}</p>

      <Section title={d0.textSize.label} description={d0.textSize.changes}>
        <ChoiceGroup label={d0.textSize.label} hideLabel value={d.textSize} onChange={(v) => update({ textSize: v as DisplaySettings["textSize"] })} options={opts(d0.textSize.options)} />
      </Section>
      <Section title={d0.density.label} description={d0.density.changes}>
        <ChoiceGroup label={d0.density.label} hideLabel value={d.density} onChange={(v) => update({ density: v as DisplaySettings["density"] })} options={opts(d0.density.options)} />
      </Section>
      <Section title={d0.motion.label} description={d0.motion.changes}>
        <ChoiceGroup label={d0.motion.label} hideLabel value={d.reduceMotion} onChange={(v) => update({ reduceMotion: v as DisplaySettings["reduceMotion"] })} options={opts(d0.motion.options)} />
      </Section>

      <Section title={d0.preview}>
        <p className="text-base text-text">{d0.sample}</p>
      </Section>

      <div>
        <Button variant="outline" onClick={() => update(DEFAULT_DISPLAY)}>
          {d0.reset}
        </Button>
      </div>
    </div>
  );
}

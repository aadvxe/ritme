import { safeStorage } from "./safe-storage";

export type TextSize = "small" | "medium" | "large";
export type Density = "compact" | "comfortable" | "spacious";
/** "system" follows prefers-reduced-motion; "on" always reduces; "off" never reduces. */
export type MotionSetting = "system" | "on" | "off";

export interface DisplaySettings {
  textSize: TextSize;
  density: Density;
  reduceMotion: MotionSetting;
}

export const DEFAULT_DISPLAY: DisplaySettings = { textSize: "medium", density: "comfortable", reduceMotion: "system" };
const KEY = "ritme.display.v1";

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function readDisplay(): DisplaySettings {
  const raw = safeStorage.get(KEY);
  if (!raw) return DEFAULT_DISPLAY;
  try {
    const p = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      textSize: oneOf(p.textSize, ["small", "medium", "large"], "medium"),
      density: oneOf(p.density, ["compact", "comfortable", "spacious"], "comfortable"),
      reduceMotion: oneOf(p.reduceMotion, ["system", "on", "off"], "system"),
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Writes the three data attributes that styles.css (and the design package) key off. */
export function applyDisplay(s: DisplaySettings, root: HTMLElement = document.documentElement): void {
  root.dataset.textSize = s.textSize;
  root.dataset.density = s.density;
  root.dataset.reduceMotion = s.reduceMotion;
}

export function saveDisplay(s: DisplaySettings): void {
  safeStorage.set(KEY, JSON.stringify(s));
  applyDisplay(s);
}

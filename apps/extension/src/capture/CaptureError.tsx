import type { FailReason } from "../extract/types";
import { FAIL_MESSAGES } from "../lib/capture-tab";
import { ErrorIcon } from "../ui/icons";
import { StatusNotice } from "../ui/StatusNotice";
import { Shell } from "./CapturePage";

const KNOWN = Object.keys(FAIL_MESSAGES);

/** Shown when a capture could not read anything. Plain wording; nothing was saved or sent. */
export function CaptureError({ reason }: { reason: string }) {
  const known: FailReason = KNOWN.includes(reason) ? (reason as FailReason) : "extractor_missing";
  return (
    <Shell>
      <StatusNotice tone="error" icon={<ErrorIcon />} title="Nothing was captured">
        <p>{FAIL_MESSAGES[known]}</p>
        <p>Nothing was sent to Ritme.</p>
      </StatusNotice>
    </Shell>
  );
}

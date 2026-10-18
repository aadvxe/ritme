import { ApiError, createApiClient, type CaptureCreateResponse } from "@ritme/api-client";
import { API_BASE_URL, WEB_ORIGIN, WEB_URL } from "../config";
import { getValidAccessToken, refreshTokens } from "./auth";
import { buildPayload, fingerprint, type CaptureDraft } from "./capture";
import { saveDraft } from "./storage";

export type SubmitResult =
  | { kind: "success"; workflowUrl: string; created: boolean }
  | { kind: "not_connected" }
  | { kind: "offline" }
  | { kind: "error"; message: string; retryable: boolean };

const api = createApiClient({ baseUrl: API_BASE_URL, getToken: getValidAccessToken });

/** Only ever open a link on the Ritme web origin, whatever the server returned. */
export function resolveWorkflowUrl(nextUrl: string | undefined): string {
  try {
    const url = new URL(nextUrl ?? "", WEB_URL);
    if (url.origin === WEB_ORIGIN) return url.toString();
  } catch {
    /* fall through */
  }
  return WEB_URL;
}

function describe(err: ApiError): SubmitResult {
  switch (err.status) {
    case 0:
      return { kind: "offline" };
    case 401:
    case 403:
      return { kind: "not_connected" };
    case 413:
      return { kind: "error", message: "This text is longer than Ritme can save. Shorten it and try again.", retryable: false };
    case 429:
      return { kind: "error", message: "Ritme is a little busy. Your draft is kept; try again in a moment.", retryable: true };
    case 400:
    case 422:
      return { kind: "error", message: err.message || "Ritme couldn't accept this text.", retryable: false };
    default:
      return { kind: "error", message: "Ritme couldn't save this right now. Your draft is kept here.", retryable: true };
  }
}

function post(draft: CaptureDraft): Promise<CaptureCreateResponse> {
  return api.captures.create(buildPayload(draft));
}

/**
 * Sends the draft. Succeeds ONLY when POST /api/captures answered 2xx with a capture.
 * Returns the draft to keep in state (the idempotency key rotates only if the payload changed
 * since the last attempt, so retries of the same content are always safe).
 */
export async function submitDraft(input: CaptureDraft): Promise<{ result: SubmitResult; draft: CaptureDraft }> {
  const print = fingerprint(input);
  const draft: CaptureDraft =
    input.attemptFingerprint !== null && input.attemptFingerprint !== print
      ? { ...input, idempotencyKey: crypto.randomUUID(), attemptFingerprint: print }
      : { ...input, attemptFingerprint: print };

  try {
    if ((await getValidAccessToken()) === null) return { result: { kind: "not_connected" }, draft };
    // Persist the key before sending so a closed tab or crash can retry with the same key.
    await saveDraft(draft);

    let res: CaptureCreateResponse;
    try {
      res = await post(draft);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      // Access token rejected: refresh once, then retry with the SAME idempotency key.
      if ((await refreshTokens()) === null) return { result: { kind: "not_connected" }, draft };
      res = await post(draft);
    }

    if (!res?.capture?.id) {
      return {
        result: {
          kind: "error",
          message: "Ritme replied, but we couldn't confirm the save. Retrying is safe; it won't create a duplicate.",
          retryable: true,
        },
        draft,
      };
    }
    return { result: { kind: "success", workflowUrl: resolveWorkflowUrl(res.nextUrl), created: res.created }, draft };
  } catch (err) {
    if (err instanceof ApiError) return { result: describe(err), draft };
    return { result: { kind: "error", message: "Something went wrong. Your draft is kept here.", retryable: true }, draft };
  }
}

/** Build-time configuration (Vite env). All values are public. */
const env = import.meta.env;

function origin(url: string): string {
  return new URL(url).origin;
}

export const API_BASE_URL: string = env.VITE_API_BASE_URL || "http://localhost:8080";
export const WEB_URL: string = env.VITE_WEB_URL || "http://localhost:5173";
export const API_ORIGIN = origin(API_BASE_URL);
export const WEB_ORIGIN = origin(WEB_URL);

const parsedMax = Number(env.VITE_MAX_CAPTURE_CHARS);
/** Mirrors the backend limit; over-limit text is rejected in the UI, never truncated. */
export const MAX_CAPTURE_CHARS: number = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 20000;

export const MAX_PAGE_TITLE_CHARS = 300;

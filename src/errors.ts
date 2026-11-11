import { HttpError } from "./util.ts";
import { YouTubeError } from "./youtube.ts";

const oauthCodes = new Set([
  "invalid_oauth_state",
  "reconnect_required",
  "google_client_invalid",
  "google_unavailable",
  "invalid_google_response",
  "youtube_api_disabled",
  "youtube_channel_unavailable",
  "youtube_access_denied",
  "youtube_channel_required",
  "youtube_scope_required",
  "channel_change_requires_migration",
  "not_configured",
  "encryption_not_configured",
  "token_unreadable",
  "busy",
]);

export function oauthFailureCode(error: unknown): string {
  if (
    error instanceof HttpError &&
    (oauthCodes.has(error.code) || /^google_(?:channel|token)_http_[1-5]\d{2}$/.test(error.code))
  )
    return error.code;
  return "failed";
}

export function publicFailure(error: unknown): { error: string; status: number } {
  if (error instanceof HttpError) return { error: error.code, status: error.status };
  if (error instanceof YouTubeError) {
    const code = error.code;
    if (code.includes("quota") || error.status === 429) return { error: code, status: 429 };
    if (
      code.includes("busy") ||
      code.includes("uncertain") ||
      code.includes("migration") ||
      code === "video_changed"
    )
      return { error: code, status: 409 };
    if (code === "connection_required") return { error: "reconnect_required", status: 401 };
    if (error.status >= 500 || error.retryable) return { error: code, status: 502 };
    return { error: code, status: 400 };
  }
  return { error: "operation_failed", status: 500 };
}

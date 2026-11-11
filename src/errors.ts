import { HttpError } from "./util.ts";
import { YouTubeError } from "./youtube.ts";

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

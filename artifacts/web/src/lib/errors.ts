/**
 * Extracts a user-friendly error message from any error value.
 * Handles ApiError objects, standard Errors, and unknown values.
 */
export function getErrorMessage(err: unknown): string {
  if (!err) return "An unexpected error occurred.";

  // ApiError from our custom fetch — `data` is the parsed JSON response body
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (typeof d.error === "string" && d.error) return d.error;
      if (typeof d.detail === "string" && d.detail) return d.detail;
      if (typeof d.message === "string" && d.message) return d.message;
    }
  }

  if (err instanceof Error) {
    // Strip the "HTTP 4xx Bad Request: " prefix that ApiError adds
    const cleaned = err.message.replace(/^HTTP \d{3}[^:]*:\s*/, "");
    return cleaned || "An unexpected error occurred.";
  }

  return "An unexpected error occurred.";
}

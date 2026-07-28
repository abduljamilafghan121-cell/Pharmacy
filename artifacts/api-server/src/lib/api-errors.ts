import type { ZodError } from "zod";

/**
 * Converts a Zod validation error into a human-readable string.
 * Example: "name: Required; price: Expected number, received string"
 */
export function formatZodError(error: ZodError): string {
  return error.errors
    .map((issue) => {
      const field =
        issue.path.length > 0
          ? String(issue.path[issue.path.length - 1])
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s) => s.toUpperCase())
          : null;
      return field ? `${field}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * Maps Postgres / Drizzle error codes to friendly messages.
 * Unwraps Drizzle's "Failed query:" wrapper automatically.
 */
export function getDbErrorMessage(err: unknown): string {
  if (
    err instanceof Error &&
    err.message.startsWith("Failed query:") &&
    (err as NodeJS.ErrnoException & { cause?: unknown }).cause
  ) {
    return getDbErrorMessage(
      (err as NodeJS.ErrnoException & { cause?: unknown }).cause,
    );
  }

  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    switch (code) {
      case "23505":
        return "A record with this information already exists.";
      case "23503":
        return "This action references a record that does not exist.";
      case "23502":
        return "A required field is missing.";
      case "ETIMEDOUT":
        return "Database connection timed out. Please try again in a moment.";
      case "ECONNREFUSED":
        return "Cannot connect to the database. Please try again.";
      case "ENOTFOUND":
        return "Database host not found. Check the connection configuration.";
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * True when the error is a Postgres foreign-key-violation (code 23503).
 * Unwraps Drizzle's "Failed query:" wrapper the same way getDbErrorMessage does.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  if (
    err instanceof Error &&
    err.message.startsWith("Failed query:") &&
    (err as NodeJS.ErrnoException & { cause?: unknown }).cause
  ) {
    return isForeignKeyViolation((err as NodeJS.ErrnoException & { cause?: unknown }).cause);
  }
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23503";
}

/**
 * Friendly message for delete endpoints: when the row is still referenced
 * elsewhere (sales history, purchase orders, etc.) explain that plainly
 * instead of surfacing a raw Postgres constraint error.
 */
export function getDeleteErrorMessage(err: unknown, entityLabel: string): string {
  if (isForeignKeyViolation(err)) {
    return `This ${entityLabel} can't be deleted because it's used in existing records (sales, purchase orders, etc.). Remove or reassign those first.`;
  }
  return getDbErrorMessage(err);
}

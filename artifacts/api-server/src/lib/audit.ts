import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";
import type { DbOrTx } from "./batch-helpers";

/**
 * Records an audit entry. Deliberately swallows its own errors — a failure
 * to log an action must never cause the actual action (e.g. deleting a
 * medicine) to fail or roll back. If you need the log write to be part of
 * an atomic transaction, pass `tx` explicitly.
 *
 * Only userId is required — the display name is resolved via a join with
 * the users table when the log is read, so it always reflects the user's
 * current name rather than a stale snapshot.
 */
export async function logAudit(
  userId: number | undefined,
  action: string,
  entityType: string,
  entityId: number | null,
  description: string,
  tx: DbOrTx = db
): Promise<void> {
  try {
    await tx.insert(auditLogsTable).values({
      userId: userId ?? null,
      action,
      entityType,
      entityId,
      description,
    });
  } catch (err) {
    logger.warn({ err, action, entityType, entityId }, "audit: failed to record entry");
  }
}


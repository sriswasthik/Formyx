import { createHash } from 'node:crypto';
import type { DataRequestKind, DataRequestStatus } from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Database } from '../lib/prisma.js';

type Client = Pick<Database, 'dataRequest'>;

/** A respondent's address as the log keeps it: hashed, so the log holds no personal data. */
export function subjectHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Counts and choices only: never names, addresses or answers. */
export type DataRequestDetails = Record<string, string | number | boolean | null>;

/** Logs a request; returns its id, to complete it later. */
export async function logDataRequest(
  db: Client,
  entry: {
    kind: DataRequestKind;
    userId: string | null;
    workspaceId?: string | null;
    subject?: string | null;
    status?: DataRequestStatus;
    details?: DataRequestDetails;
  },
): Promise<string> {
  const done = entry.status === 'DONE';
  const { id } = await db.dataRequest.create({
    data: {
      kind: entry.kind,
      status: entry.status ?? 'OPEN',
      userId: entry.userId,
      workspaceId: entry.workspaceId ?? null,
      subjectHash: entry.subject ? subjectHash(entry.subject) : null,
      details: entry.details ?? {},
      ...(done && { completedAt: new Date() }),
    },
    select: { id: true },
  });
  return id;
}

/** Marks a logged request finished (or cancelled, or failed), adding to its details. */
export async function completeDataRequest(
  db: Client,
  id: string,
  status: Exclude<DataRequestStatus, 'OPEN'>,
  details: DataRequestDetails = {},
): Promise<void> {
  const current = await db.dataRequest.findUnique({ where: { id }, select: { details: true } });
  if (!current) return;
  await db.dataRequest.update({
    where: { id },
    data: {
      status,
      completedAt: new Date(),
      details: { ...(current.details as Prisma.JsonObject), ...details },
    },
  });
}

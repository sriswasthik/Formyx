import {
  isFileAnswer,
  RESPONDENT_LOOKUP_LIMIT,
  type RespondentLookupResponse,
} from '@formyx/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { EventBus } from '../lib/events.js';
import type { Database } from '../lib/prisma.js';
import type { UploadStorage } from '../lib/upload-storage.js';
import { logDataRequest } from './data-request-log.js';

/*
 * Respondents' requests about their data: a workspace's editors look up every response that
 * holds an address (given before the questions, or in any answer) and can delete them all,
 * uploaded files included. Each lookup and deletion is logged, with the address hashed.
 */

interface MatchRow {
  id: string;
  form_id: string;
  form_title: string;
  created_at: Date;
  by_respondent_email: boolean;
}

/** Responses in the workspace's forms holding `email`, newest first. */
function matchingSql(workspaceId: string, email: string, limit?: number): Prisma.Sql {
  return Prisma.sql`
    SELECT s.id, s.form_id, COALESCE(f.published_title, f.title) AS form_title, s.created_at,
      lower(s.respondent_email) = ${email} AS by_respondent_email
    FROM submissions s JOIN forms f ON f.id = s.form_id
    WHERE f.workspace_id = ${workspaceId} AND (
      lower(s.respondent_email) = ${email}
      OR EXISTS (
        SELECT 1 FROM jsonb_each_text(s.answers) AS answer
        WHERE lower(btrim(answer.value)) = ${email}
      )
    )
    ORDER BY s.created_at DESC, s.id DESC
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `;
}

export interface RespondentDataService {
  lookup(workspaceId: string, userId: string, email: string): Promise<RespondentLookupResponse>;
  /** Deletes every response holding `email`, with its files; returns how many. */
  remove(workspaceId: string, userId: string, email: string): Promise<number>;
}

export function createRespondentDataService({
  prisma,
  storage,
  events,
}: {
  prisma: Database;
  storage: UploadStorage | null;
  events: Pick<EventBus, 'emit'>;
}): RespondentDataService {
  return {
    async lookup(workspaceId, userId, email) {
      const [rows, counted] = await Promise.all([
        prisma.$queryRaw<MatchRow[]>(matchingSql(workspaceId, email, RESPONDENT_LOOKUP_LIMIT)),
        prisma.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM (${matchingSql(workspaceId, email)}) AS matches
        `,
      ]);
      const total = Number(counted[0]?.total ?? 0);
      await logDataRequest(prisma, {
        kind: 'RESPONDENT_LOOKUP',
        status: 'DONE',
        userId,
        workspaceId,
        subject: email,
        details: { responses: total },
      });
      return {
        total,
        matches: rows.map((row) => ({
          submissionId: row.id,
          formId: row.form_id,
          formTitle: row.form_title,
          createdAt: row.created_at.toISOString(),
          matchedBy: row.by_respondent_email ? 'respondent_email' : 'answer',
        })),
      };
    },

    async remove(workspaceId, userId, email) {
      const rows = await prisma.$queryRaw<MatchRow[]>(matchingSql(workspaceId, email));
      const ids = rows.map(({ id }) => id);
      if (ids.length > 0) {
        // Their files first: a response deleted with its files still stored would leave them.
        const stored = await prisma.submission.findMany({
          where: { id: { in: ids } },
          select: { answers: true },
        });
        const files = stored.flatMap(({ answers }) =>
          Object.values(typeof answers === 'object' && answers !== null ? answers : {}).filter(
            isFileAnswer,
          ),
        );
        if (files.length > 0 && storage) await storage.deleteFiles(files.map(({ url }) => url));
        await prisma.submission.deleteMany({ where: { id: { in: ids } } });
        const byForm = new Map<string, string[]>();
        for (const row of rows)
          byForm.set(row.form_id, [...(byForm.get(row.form_id) ?? []), row.id]);
        for (const [formId, deleted] of byForm) {
          events.emit('submissions.deleted', { formId, ids: deleted });
        }
      }
      await logDataRequest(prisma, {
        kind: 'RESPONDENT_DELETION',
        status: 'DONE',
        userId,
        workspaceId,
        subject: email,
        details: { responses: ids.length },
      });
      return ids.length;
    },
  };
}

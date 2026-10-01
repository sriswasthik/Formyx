import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  answerableFields,
  deleteSubmissionsInputSchema,
  formatAnswer,
  isFileAnswer,
  listSubmissionsQuerySchema,
  slugify,
  type DeleteSubmissionsResponse,
  type Field,
  type FormSchema,
  type SubmissionPage,
  type SubmissionRecord,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { CSV_BOM, toCsvRow, type CsvValue } from '../lib/csv.js';
import type { Database } from '../lib/prisma.js';
import { routeParam } from '../lib/route-param.js';
import type { AuthGuards } from '../middleware/auth.js';
import { createSubmissionService, submissionBatches } from '../services/submission-service.js';

const EXPORT_BATCH_SIZE = 500;

function csvValue(field: Field, value: unknown): CsvValue {
  // Numbers and ratings stay numeric, so spreadsheets can sum and chart them.
  if (typeof value === 'number') return value;
  // Files export as a link to download them.
  if (isFileAnswer(value)) return value.url;
  return formatAnswer(field, value);
}

/** The export, a chunk per batch of responses: a header row, then newest first. */
async function* csvChunks(
  prisma: Database,
  formId: string,
  schema: FormSchema | null,
): AsyncGenerator<string> {
  const fields = schema ? answerableFields(schema) : [];
  yield CSV_BOM +
    toCsvRow([
      'Response ID',
      'Submitted at (UTC)',
      ...fields.map((field) => field.label.trim() || 'Untitled question'),
      'Time to complete (seconds)',
    ]);

  const row = (submission: SubmissionRecord) =>
    toCsvRow([
      submission.id,
      submission.createdAt,
      ...fields.map((field) => csvValue(field, submission.answers[field.id])),
      submission.completionTimeMs === null ? null : Math.round(submission.completionTimeMs / 1000),
    ]);

  for await (const batch of submissionBatches(prisma, formId, { size: EXPORT_BATCH_SIZE })) {
    yield batch.map(row).join('');
  }
}

/** Reading responses takes any role in the workspace; deleting them takes EDITOR or above. */
export function createSubmissionsRouter(
  { prisma, events, logger }: AppDependencies,
  { requireAuth, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const submissions = createSubmissionService(prisma);

  router.get(
    '/forms/:formId/submissions',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const query = listSubmissionsQuerySchema.parse(req.query);
      const body: SubmissionPage = await submissions.list(routeParam(req, 'formId'), query);
      res.json(body);
    },
  );

  // Declared before `/:submissionId`, which would otherwise take "export" for an id.
  router.get(
    '/forms/:formId/submissions/export',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const formId = routeParam(req, 'formId');
      const { title, schema } = await submissions.published(formId);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${slugify(title, 60) || 'form'}-responses-${date}.csv`;

      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      });
      try {
        // `pipeline` waits for the client to take each chunk, and stops reading if it leaves.
        await pipeline(Readable.from(csvChunks(prisma, formId, schema)), res);
      } catch (error) {
        // Once rows are on their way the status is sent; all that is left is to cut it short.
        if (!res.headersSent) throw error;
        if (res.writableEnded || req.destroyed) {
          logger.info({ formId }, 'Response export stopped: the client went away');
        } else {
          logger.error({ err: error, formId }, 'Response export failed part way');
        }
        res.destroy();
      }
    },
  );

  router.get(
    '/forms/:formId/submissions/:submissionId',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const body: SubmissionRecord = await submissions.get(
        routeParam(req, 'formId'),
        routeParam(req, 'submissionId'),
      );
      res.json(body);
    },
  );

  router.delete(
    '/forms/:formId/submissions/:submissionId',
    requireAuth,
    requireFormRole('EDITOR'),
    async (req, res) => {
      const formId = routeParam(req, 'formId');
      const deleted = await submissions.remove(formId, [routeParam(req, 'submissionId')]);
      if (deleted.length === 0) throw new AppError(404, 'NOT_FOUND', 'Response not found');

      events.emit('submissions.deleted', { formId, ids: deleted });
      res.status(204).end();
    },
  );

  router.post(
    '/forms/:formId/submissions/bulk-delete',
    requireAuth,
    requireFormRole('EDITOR'),
    async (req, res) => {
      const formId = routeParam(req, 'formId');
      const { ids } = deleteSubmissionsInputSchema.parse(req.body);
      const deleted = await submissions.remove(formId, ids);

      if (deleted.length > 0) events.emit('submissions.deleted', { formId, ids: deleted });
      const body: DeleteSubmissionsResponse = { deleted: deleted.length };
      res.json(body);
    },
  );

  return router;
}

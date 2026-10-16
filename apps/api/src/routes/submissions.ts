import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  deleteAllResponsesInputSchema,
  deleteSubmissionsInputSchema,
  listSubmissionsQuerySchema,
  slugify,
  type DeleteAllResponsesResponse,
  type DeleteSubmissionsResponse,
  type SubmissionPage,
  type SubmissionRecord,
} from '@formyx/shared';
import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { writeWorkbook } from '../lib/xlsx.js';
import type { Guards } from './index.js';
import { csvChunks, exportTable, extraColumns } from '../services/response-export.js';
import { createSubmissionService } from '../services/submission-service.js';

/** Streams an export, cutting it short (and saying so in the log) if the client goes away. */
async function streamExport(
  req: Request,
  res: Response,
  logger: Logger,
  formId: string,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
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
}

function exportName(title: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${slugify(title, 60) || 'form'}-responses-${date}.${extension}`;
}

/** Reading responses takes any role in the workspace; deleting them takes EDITOR or above. */
export function createSubmissionsRouter(
  { prisma, events, logger }: AppDependencies,
  { requireAuth, requireFormRole, requireFeature }: Guards,
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
      const { title, ...published } = await submissions.published(formId);
      const table = exportTable(prisma, formId, published, await extraColumns(prisma, formId));
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportName(title, 'csv')}"`,
        'Cache-Control': 'no-store',
      });
      // `pipeline` waits for the client to take each chunk, and stops reading if it leaves.
      await streamExport(req, res, logger, formId, () =>
        pipeline(Readable.from(csvChunks(table)), res),
      );
    },
  );

  router.get(
    '/forms/:formId/submissions/export.xlsx',
    requireAuth,
    requireFormRole('VIEWER'),
    requireFeature('excel_export'),
    async (req, res) => {
      const formId = routeParam(req, 'formId');
      const { title, ...published } = await submissions.published(formId);
      const table = exportTable(prisma, formId, published, await extraColumns(prisma, formId));
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportName(title, 'xlsx')}"`,
        'Cache-Control': 'no-store',
      });
      await streamExport(req, res, logger, formId, () => writeWorkbook(res, title, table));
    },
  );

  // Every response at once, with the form's title typed out to confirm.
  router.post(
    '/forms/:formId/submissions/delete-all',
    requireAuth,
    requireFormRole('EDITOR'),
    async (req, res) => {
      const formId = routeParam(req, 'formId');
      const { confirm } = deleteAllResponsesInputSchema.parse(req.body);
      const form = await prisma.form.findUnique({ where: { id: formId }, select: { title: true } });
      if (!form) throw new AppError(404, 'NOT_FOUND', 'Form not found');
      if (confirm.trim() !== form.title.trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Type the form title to confirm.', {
          details: [{ path: 'confirm', message: "Type the form's title exactly" }],
        });
      }
      const deleted = await submissions.removeAll(formId);
      if (deleted.length > 0) events.emit('submissions.deleted', { formId, ids: deleted });
      const body: DeleteAllResponsesResponse = { deleted: deleted.length };
      res.json(body);
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

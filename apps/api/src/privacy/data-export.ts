import {
  DATA_EXPORT_DAYS,
  DATA_EXPORT_README,
  readAccountPreferences,
  readLiveSettings,
  retiredFieldsSchema,
  type DataExport,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { JobQueue } from '../jobs/queue.js';
import { AppError } from '../lib/app-error.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { createZip, type ZipEntry } from '../lib/zip.js';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from '../notifications/email-layout.js';
import { parsePublishedSchema } from '../services/form-service.js';
import { csvChunks, exportTable, extraColumns } from '../services/response-export.js';
import { submissionBatches } from '../services/submission-service.js';
import { completeDataRequest, logDataRequest } from './data-request-log.js';

/*
 * Someone's copy of everything Formyx holds about them (DPDP's right of access): their
 * account, the workspaces they belong to, and for the workspaces they own, every form with
 * its responses as JSON and CSV. Made by a background job, kept for a week, and downloadable
 * only by them, signed in.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Exports someone may ask for in a day. */
export const EXPORTS_PER_DAY = 3;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A folder name for a form: its slug, which is already safe in a path. */
const folderOf = (slug: string) => slug.replace(/[^\w.-]/g, '-');

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let text = '';
  for await (const chunk of chunks) text += chunk;
  return text;
}

/** The ZIP's files for `userId`. */
export async function buildDataExport(prisma: Database, userId: string): Promise<ZipEntry[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      emailVerifiedAt: true,
      preferences: true,
      signupSource: true,
      signInIdentities: { select: { provider: true, email: true, createdAt: true } },
      memberships: {
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          createdAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              plan: true,
              memberships: {
                orderBy: { createdAt: 'asc' },
                select: { role: true, user: { select: { name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });

  const entries: ZipEntry[] = [
    { name: 'README.txt', data: DATA_EXPORT_README },
    {
      name: 'account.json',
      data: json({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        emailConfirmedAt: user.emailVerifiedAt?.toISOString() ?? null,
        preferences: readAccountPreferences(user.preferences),
        signedUpFrom: user.signupSource,
        signInMethods: user.signInIdentities.map((identity) => ({
          provider: identity.provider,
          email: identity.email,
          since: identity.createdAt.toISOString(),
        })),
      }),
    },
    {
      name: 'workspaces.json',
      data: json(
        user.memberships.map(({ role, createdAt, workspace }) => ({
          id: workspace.id,
          name: workspace.name,
          role,
          joinedAt: createdAt.toISOString(),
          // Who else is in it: only for the workspaces they own, as owners see members.
          ...(role === 'OWNER' && {
            plan: workspace.plan,
            createdAt: workspace.createdAt.toISOString(),
            members: workspace.memberships.map((member) => ({
              name: member.user.name,
              email: member.user.email,
              role: member.role,
            })),
          }),
        })),
      ),
    },
  ];

  const owned = user.memberships
    .filter(({ role }) => role === 'OWNER')
    .map(({ workspace }) => workspace.id);
  const forms = await prisma.form.findMany({
    where: { workspaceId: { in: owned } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      workspaceId: true,
      createdAt: true,
      publishedAt: true,
      draftSchema: true,
      publishedSchema: true,
      publishedTitle: true,
      retiredFields: true,
      theme: true,
      liveSettings: true,
    },
  });
  for (const form of forms) {
    const folder = `forms/${folderOf(form.slug)}`;
    const schema = parsePublishedSchema(form.publishedSchema);
    const retiredFields = retiredFieldsSchema.parse(form.retiredFields);
    entries.push({
      name: `${folder}/form.json`,
      data: json({
        id: form.id,
        workspaceId: form.workspaceId,
        title: form.title,
        publishedTitle: form.publishedTitle,
        status: form.status,
        createdAt: form.createdAt.toISOString(),
        publishedAt: form.publishedAt?.toISOString() ?? null,
        // Settings without secrets: passwords and chat webhooks are never exported.
        settings: readLiveSettings(form.liveSettings),
        draft: form.draftSchema,
        published: form.publishedSchema,
        deletedQuestions: retiredFields,
        theme: form.theme,
      }),
    });
    const responses = [];
    for await (const batch of submissionBatches(prisma, form.id, { size: 500 })) {
      responses.push(...batch);
    }
    entries.push({ name: `${folder}/responses.json`, data: json(responses) });
    const table = exportTable(
      prisma,
      form.id,
      { schema, retiredFields },
      await extraColumns(prisma, form.id),
    );
    entries.push({ name: `${folder}/responses.csv`, data: await collect(csvChunks(table)) });
  }
  return entries;
}

export function renderDataExportEmail({
  appUrl,
  name,
}: {
  appUrl: string;
  name: string;
}): RenderedEmail {
  const subject = 'Your Formyx data is ready';
  const first = singleLine(name).split(' ')[0] ?? '';
  const title = first ? `Your data is ready, ${first}` : 'Your data is ready';
  const line = `Download it from your account settings while signed in. It stays there for ${String(DATA_EXPORT_DAYS)} days.`;
  const link = `${appUrl}/app/settings#your-data`;
  const ignore = 'If you didn’t ask for this, change your password: someone else may be signed in.';
  return {
    subject,
    text: [title, '', line, '', `Download your data: ${link}`, '', ignore].join('\n'),
    html: emailPage({
      appUrl,
      subject,
      preheader: 'A ZIP of your account, forms and responses.',
      card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`, escapeHtml(line))}
        ${button('Download your data', link)}`,
      footer: escapeHtml(ignore),
    }),
  };
}

function toView(row: {
  id: string;
  status: DataExport['status'];
  createdAt: Date;
  readyAt: Date | null;
  expiresAt: Date;
  bytes: number | null;
}): DataExport {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    bytes: row.bytes,
  };
}

const viewSelect = {
  id: true,
  status: true,
  createdAt: true,
  readyAt: true,
  expiresAt: true,
  bytes: true,
} as const;

export interface DataExportService {
  /** Starts an export, or returns the one already being made. */
  request(userId: string): Promise<DataExport>;
  list(userId: string): Promise<DataExport[]>;
  /** The ZIP, if it is theirs, ready and not expired. */
  download(userId: string, exportId: string): Promise<{ archive: Buffer; createdAt: Date }>;
}

export function createDataExportService({
  prisma,
  jobs,
  now = () => new Date(),
}: {
  prisma: Database;
  jobs: Pick<JobQueue, 'send'>;
  now?: () => Date;
}): DataExportService {
  return {
    async request(userId) {
      const pending = await prisma.dataExport.findFirst({
        where: { userId, status: 'PENDING' },
        select: viewSelect,
      });
      if (pending) return toView(pending);
      const today = await prisma.dataExport.count({
        where: { userId, createdAt: { gte: new Date(now().getTime() - DAY_MS) } },
      });
      if (today >= EXPORTS_PER_DAY) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          `You can ask for your data ${String(EXPORTS_PER_DAY)} times a day. Try again tomorrow.`,
        );
      }
      const created = await prisma.dataExport.create({
        data: { userId, expiresAt: new Date(now().getTime() + DATA_EXPORT_DAYS * DAY_MS) },
        select: viewSelect,
      });
      const requestId = await logDataRequest(prisma, { kind: 'ACCOUNT_EXPORT', userId });
      await jobs.send('privacy.export', { exportId: created.id, requestId });
      return toView(created);
    },

    async list(userId) {
      const rows = await prisma.dataExport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: viewSelect,
      });
      return rows.map(toView);
    },

    async download(userId, exportId) {
      const found = await prisma.dataExport.findUnique({
        where: { id: exportId },
        select: { userId: true, status: true, archive: true, expiresAt: true, createdAt: true },
      });
      // Someone else's looks just like a missing one.
      if (found?.userId !== userId) throw new AppError(404, 'NOT_FOUND', 'Export not found');
      if (found.status !== 'READY' || !found.archive || found.expiresAt <= now()) {
        throw new AppError(
          410,
          'EXPORT_EXPIRED',
          'This export is no longer available. Ask for a new one.',
        );
      }
      return { archive: Buffer.from(found.archive), createdAt: found.createdAt };
    },
  };
}

/** Clears exports past their week: the archive goes, the row says it expired. */
export async function expireDataExports(prisma: Database, now: Date = new Date()): Promise<number> {
  const { count } = await prisma.dataExport.updateMany({
    where: { expiresAt: { lte: now }, status: { in: ['READY', 'PENDING', 'FAILED'] } },
    data: { status: 'EXPIRED', archive: null },
  });
  return count;
}

export function registerDataExports({
  jobs,
  prisma,
  mailer,
  logger,
  env,
}: {
  jobs: JobQueue;
  prisma: Database;
  mailer: Mailer;
  logger: Logger;
  env: Env;
}): void {
  jobs.handle('privacy.export', async ({ exportId, requestId }, { attempt, lastAttempt }) => {
    const found = await prisma.dataExport.findUnique({
      where: { id: exportId },
      select: { userId: true, status: true, user: { select: { name: true, email: true } } },
    });
    if (found?.status !== 'PENDING') return;
    try {
      const archive = createZip(await buildDataExport(prisma, found.userId));
      await prisma.dataExport.update({
        where: { id: exportId },
        data: {
          status: 'READY',
          archive: new Uint8Array(archive),
          bytes: archive.length,
          readyAt: new Date(),
        },
      });
    } catch (error) {
      if (lastAttempt) {
        await prisma.dataExport.update({ where: { id: exportId }, data: { status: 'FAILED' } });
        await completeDataRequest(prisma, requestId, 'FAILED');
      }
      logger.error({ err: error, exportId, attempt }, 'Could not make a data export');
      throw error;
    }
    await completeDataRequest(prisma, requestId, 'DONE');
    const email = renderDataExportEmail({ appUrl: env.APP_URL, name: found.user.name });
    await mailer.send([{ to: found.user.email, ...email }], {
      idempotencyKey: `data-export-${exportId}`,
    });
  });
}

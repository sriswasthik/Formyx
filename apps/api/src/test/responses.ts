import { randomUUID } from 'node:crypto';
import { createDefaultTheme, type FormSchema } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/** A form published with `schema`, created directly for speed. */
export async function createPublishedForm(
  prisma: Database,
  workspaceId: string,
  schema: FormSchema,
  title = 'Customer survey',
): Promise<{ id: string; slug: string }> {
  return prisma.form.create({
    data: {
      workspaceId,
      title,
      slug: `survey-${randomUUID()}`,
      status: 'PUBLISHED',
      draftSchema: schema,
      publishedSchema: schema,
      publishedTitle: title,
      publishedAt: new Date(),
      theme: createDefaultTheme(),
    },
    select: { id: true, slug: true },
  });
}

/** A stored response, at `createdAt` when the test needs a particular time. */
export async function createSubmission(
  prisma: Database,
  formId: string,
  {
    answers = {},
    createdAt,
    completionTimeMs = null,
  }: {
    answers?: Record<string, string | number | string[]>;
    createdAt?: Date;
    completionTimeMs?: number | null;
  } = {},
): Promise<{ id: string; createdAt: Date }> {
  return prisma.submission.create({
    data: {
      formId,
      answers,
      completionTimeMs,
      metadata: { userAgent: 'Vitest', referrer: null },
      ...(createdAt && { createdAt }),
    },
    select: { id: true, createdAt: true },
  });
}

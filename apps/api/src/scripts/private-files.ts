import { isFileAnswer, type FileAnswer } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';
import { answerFolder, fileLink, type UploadStorage } from '../lib/upload-storage.js';

const BATCH = 200;

export interface PrivateFilesReport {
  /** Responses that had public files. */
  responses: number;
  /** Files made private (or that would be, in a dry run). */
  files: number;
  /** Files storage no longer has: their answers are left as they are. */
  missing: number;
}

/**
 * Moves respondents' files uploaded before they were private: each public file in a
 * response is made private in storage, and its answer's URL becomes the Formyx file link,
 * so only the form's members can open it. Files that are already links, theme images and
 * anything outside the form's own folders are left alone. Safe to run again: a file made
 * private by a run that stopped before saving is found and its link saved.
 */
export async function makeAnswerFilesPrivate(
  prisma: Database,
  storage: UploadStorage,
  { root, appUrl, dryRun }: { root: string; appUrl: string; dryRun: boolean },
): Promise<PrivateFilesReport> {
  const report: PrivateFilesReport = { responses: 0, files: 0, missing: 0 };
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.submission.findMany({
      select: { id: true, formId: true, answers: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (batch.length === 0) break;
    cursor = batch.at(-1)?.id;

    for (const { id, formId, answers } of batch) {
      if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) continue;
      const changed: Record<string, FileAnswer> = {};
      for (const [fieldId, answer] of Object.entries(answers)) {
        if (!isFileAnswer(answer)) continue;
        const location = storage.locate(answer.url);
        if (location?.deliveryType !== 'upload') continue;
        if (!location.publicId.startsWith(`${answerFolder(root, formId, fieldId)}/`)) continue;
        if (dryRun) {
          changed[fieldId] = answer;
          continue;
        }
        const moved = await storage.makePrivate(location);
        if (!moved) {
          report.missing += 1;
          continue;
        }
        changed[fieldId] = { ...answer, url: fileLink(appUrl, formId, moved) };
      }
      const count = Object.keys(changed).length;
      if (count === 0) continue;
      report.responses += 1;
      report.files += count;
      if (dryRun) continue;
      await prisma.submission.update({
        where: { id },
        data: { answers: { ...answers, ...changed } },
      });
    }
    if (batch.length < BATCH) break;
  }
  return report;
}

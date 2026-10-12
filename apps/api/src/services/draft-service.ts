import { randomBytes } from 'node:crypto';
import {
  DRAFT_LIFETIME_DAYS,
  draftStateSchema,
  sanitizeAnswers,
  storedAnswerSchema,
  type DraftResponse,
  type FormSchema,
  type saveDraftInputSchema,
} from '@formyx/shared';
import { z } from 'zod';
import { AppError } from '../lib/app-error.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { renderDraftEmail } from '../notifications/draft-email.js';
import { hashToken } from './public-form-service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const storedAnswersSchema = z.record(z.string(), storedAnswerSchema);

export interface DraftService {
  /**
   * Saves a respondent's answers and emails them a link to finish later. Only the hash of
   * the link's token and the answers are kept, never the address.
   */
  save(slug: string, input: z.output<typeof saveDraftInputSchema>): Promise<void>;
  /** The saved answers behind a link's token; 404 once used or expired. */
  resume(slug: string, token: string): Promise<DraftResponse>;
}

interface DraftDependencies {
  prisma: Database;
  mailer: Mailer;
  appUrl: string;
  /** The open form behind `slug`: 404 or 410 otherwise. */
  openForm: (slug: string) => Promise<{ id: string; schema: FormSchema; title: string }>;
  now?: () => Date;
}

function draftsOff(): AppError {
  return new AppError(403, 'DRAFTS_OFF', 'This form does not save answers for later.');
}

function linkExpired(): AppError {
  return new AppError(
    404,
    'NOT_FOUND',
    'This link has expired or was already used. Start the form again.',
  );
}

export function createDraftService({
  prisma,
  mailer,
  appUrl,
  openForm,
  now = () => new Date(),
}: DraftDependencies): DraftService {
  return {
    async save(slug, input) {
      const form = await openForm(slug);
      if (form.schema.settings.saveProgress !== 'email') throw draftsOff();

      // Only answers to the form's questions are kept; they are checked when submitted.
      const answers = storedAnswersSchema.parse(sanitizeAnswers(form.schema, input.answers));
      const token = randomBytes(32).toString('base64url');
      const created = now();
      await prisma.$transaction([
        // Expired drafts go whenever a new one is saved.
        prisma.formDraft.deleteMany({ where: { expiresAt: { lt: created } } }),
        prisma.formDraft.create({
          data: {
            formId: form.id,
            tokenHash: hashToken(token),
            answers,
            state: input.state,
            expiresAt: new Date(created.getTime() + DRAFT_LIFETIME_DAYS * DAY_MS),
          },
        }),
      ]);

      const email = renderDraftEmail({
        formTitle: form.title,
        // In the fragment, so the token never reaches a server log or a referrer.
        resumeUrl: `${appUrl}/f/${encodeURIComponent(slug)}#resume=${token}`,
      });
      await mailer.send([{ to: input.email, ...email }], {
        idempotencyKey: `draft/${hashToken(token).slice(0, 32)}`,
      });
    },

    async resume(slug, token) {
      const form = await openForm(slug);
      const draft = await prisma.formDraft.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { formId: true, answers: true, state: true, expiresAt: true },
      });
      if (draft?.formId !== form.id || draft.expiresAt <= now()) throw linkExpired();
      const state = draftStateSchema.safeParse(draft.state);
      const answers = storedAnswersSchema.safeParse(draft.answers);
      return {
        answers: answers.success ? answers.data : {},
        state: state.success ? state.data : {},
      };
    },
  };
}

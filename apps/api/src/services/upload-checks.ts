import {
  allowedExtensions,
  BYTES_PER_MB,
  fileExtension,
  isFileAnswer,
  THEME_IMAGE_FORMATS,
  THEME_IMAGE_MAX_MB,
  type FileAnswer,
  type FormSchema,
  type SubmissionInput,
  type ValidationIssue,
} from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import { answerFolder, themeFolder, type UploadStorage } from '../lib/upload-storage.js';

type Answers = SubmissionInput['answers'];

export function uploadsUnavailable(): AppError {
  return new AppError(503, 'UPLOADS_UNAVAILABLE', 'File uploads are not available right now.');
}

export interface UploadChecks {
  /**
   * Checks every uploaded file among `answers` against storage: it must have been uploaded
   * for that form and question, and its real size and format must fit the question. Returns
   * the answers with each file's URL and size as storage reports them. Throws 400 with an
   * issue per bad file, or 503 if uploads are off.
   */
  verifyAnswers(form: { id: string; schema: FormSchema }, answers: Answers): Promise<Answers>;
  /** Checks a logo or cover image was uploaded for this form, as an image. */
  verifyThemeImage(formId: string, url: string): Promise<void>;
  /** The form a theme image was uploaded for, by where it is stored; `null` if none. */
  themeImageFormId(url: string): string | null;
}

interface CheckOptions {
  storage: UploadStorage | null;
  /** Top-level folder, `CLOUDINARY_FOLDER`. */
  root: string;
}

function issue(fieldId: string, message: string): ValidationIssue {
  return { path: `answers.${fieldId}`, message };
}

export function createUploadChecks({ storage, root }: CheckOptions): UploadChecks {
  /** Why `answer` cannot be kept, or the file as storage has it. */
  async function check(
    storageImpl: UploadStorage,
    folder: string,
    answer: FileAnswer,
    limits: { maxBytes: number; formats: readonly string[] },
  ): Promise<{ problem: string } | { file: FileAnswer }> {
    const publicId = storageImpl.publicIdOf(answer.url);
    if (!publicId?.startsWith(`${folder}/`)) {
      return { problem: 'This file wasn’t uploaded for this question. Upload it again.' };
    }
    const stored = await storageImpl.describe(answer.url);
    if (!stored) return { problem: 'This upload could not be found. Upload it again.' };
    if (stored.bytes > limits.maxBytes) {
      return {
        problem: `This file is too big. The limit is ${Math.round(limits.maxBytes / BYTES_PER_MB)} MB`,
      };
    }
    // Cloudinary names the format of images, video and audio; other files keep their
    // extension in their id.
    const format = stored.format ?? fileExtension(stored.publicId);
    if (!limits.formats.includes(format.toLowerCase())) {
      return { problem: 'This type of file isn’t accepted here' };
    }
    return {
      file: { ...answer, url: stored.secureUrl, publicId: stored.publicId, size: stored.bytes },
    };
  }

  return {
    async verifyAnswers(form, answers) {
      const fileFields = form.schema.fields.flatMap((field) =>
        field.type === 'file' && isFileAnswer(answers[field.id]) ? [field] : [],
      );
      if (fileFields.length === 0) return answers;
      if (!storage) throw uploadsUnavailable();

      const issues: ValidationIssue[] = [];
      const verified: Answers = { ...answers };
      await Promise.all(
        fileFields.map(async (field) => {
          const answer = answers[field.id];
          if (!isFileAnswer(answer)) return;
          const result = await check(storage, answerFolder(root, form.id, field.id), answer, {
            maxBytes: field.fileConfig.maxSizeMb * BYTES_PER_MB,
            formats: allowedExtensions(field.fileConfig.allowedTypes),
          });
          if ('problem' in result) issues.push(issue(field.id, result.problem));
          else verified[field.id] = result.file;
        }),
      );
      if (issues.length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Some answers need your attention.', {
          details: issues,
        });
      }
      return verified;
    },

    themeImageFormId(url) {
      const publicId = storage?.publicIdOf(url);
      const prefix = `${root}/themes/`;
      if (!publicId?.startsWith(prefix)) return null;
      return publicId.slice(prefix.length).split('/')[0] || null;
    },

    async verifyThemeImage(formId, url) {
      if (!storage) throw uploadsUnavailable();
      const result = await check(
        storage,
        themeFolder(root, formId),
        { url, publicId: '', name: url, size: 0, type: '' },
        { maxBytes: THEME_IMAGE_MAX_MB * BYTES_PER_MB, formats: THEME_IMAGE_FORMATS },
      );
      if ('problem' in result) {
        const message = 'Upload the image again: it could not be checked.';
        throw new AppError(400, 'VALIDATION_ERROR', message, {
          details: [{ path: 'theme', message }],
        });
      }
    },
  };
}

import { z } from 'zod';
import type { FileCategory } from './fields.js';

export const BYTES_PER_MB = 1024 * 1024;

/**
 * The file extensions each category accepts. They double as Cloudinary formats, which the
 * signed upload restricts to, so Cloudinary refuses anything else.
 */
export const FILE_CATEGORY_EXTENSIONS: Record<FileCategory, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'txt'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv'],
  presentation: ['ppt', 'pptx', 'odp', 'key'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
  video: ['mp4', 'mov', 'webm', 'm4v'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
};

/** Extensions allowed by any of `categories`. */
export function allowedExtensions(categories: readonly FileCategory[]): string[] {
  return [...new Set(categories.flatMap((category) => FILE_CATEGORY_EXTENSIONS[category]))];
}

/** "Report.Final.PDF" -> "pdf"; empty when there is none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase();
}

export interface FileFacts {
  name: string;
  /** Bytes. */
  size: number;
}

/** Why a file cannot be sent to a question with these limits, or `null` if it can. */
export function fileProblem(
  file: FileFacts,
  { maxSizeMb, allowedTypes }: { maxSizeMb: number; allowedTypes: readonly FileCategory[] },
): string | null {
  if (!allowedExtensions(allowedTypes).includes(fileExtension(file.name))) {
    return 'This type of file isn’t accepted here';
  }
  if (file.size > maxSizeMb * BYTES_PER_MB) {
    return `This file is too big. The limit is ${maxSizeMb} MB`;
  }
  if (file.size === 0) return 'This file is empty';
  return null;
}

/** An uploaded file, as an answer to a file question. */
export const fileAnswerSchema = z.object({
  /** Where to download it (https). */
  url: z.url({ protocol: /^https$/ }).max(2048),
  /** The file's id in storage; the server checks it really was uploaded for this question. */
  publicId: z.string().min(1).max(512),
  /** The name it had on the respondent's device. */
  name: z.string().trim().min(1).max(255),
  /** Bytes. */
  size: z.number().int().min(0),
  /** MIME type, as the browser reported it. */
  type: z.string().max(255),
});
export type FileAnswer = z.infer<typeof fileAnswerSchema>;

export function isFileAnswer(value: unknown): value is FileAnswer {
  return fileAnswerSchema.safeParse(value).success;
}

/** "2.4 MB", "830 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / BYTES_PER_MB;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

import type { FieldOfType, FileAnswer } from '@formyx/shared';
import { createContext, useContext } from 'react';
import type { UploadOptions } from '@/lib/uploads';

/** Uploads a respondent's file for a question and returns the answer to send. */
export type FileUploader = (
  field: FieldOfType<'file'>,
  file: File,
  options: UploadOptions,
) => Promise<FileAnswer>;

export interface FileUploads {
  /** `null` where files cannot be uploaded. */
  upload: FileUploader | null;
  /** Marks a question as waiting for its file, so the form is not sent without it. */
  setUploading: (fieldId: string, uploading: boolean) => void;
  /** Shows why a file was not uploaded, under its question. */
  reportProblem: (fieldId: string, message: string) => void;
}

export const FileUploadsContext = createContext<FileUploads | null>(null);

export function useFileUploads(): FileUploads | null {
  return useContext(FileUploadsContext);
}

/**
 * For the editor's preview, where nothing is saved: the file stays on the device and the
 * answer only stands in for it.
 */
export const previewUpload: FileUploader = (_field, file) =>
  Promise.resolve({
    url: 'https://preview.formyx.invalid/file',
    publicId: 'preview',
    name: file.name.slice(0, 255),
    size: file.size,
    type: file.type,
  });

import type { AnswerValue, FieldOfType, UploadFieldType } from '@formyx/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isUploadCancelled, uploadErrorMessage } from '@/lib/uploads';
import { useFileUploads } from '../file-uploads';

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'failed'; message: string };

/**
 * Uploads a file made in the form (a drawn signature, a recorded voice note) as the answer
 * to `field`: marks the question busy meanwhile, reports problems under it, and stops when
 * the question goes away.
 */
export function useAnswerUpload(
  field: FieldOfType<UploadFieldType>,
  onChange: (value: AnswerValue) => void,
) {
  const uploads = useFileUploads();
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const fieldId = field.id;
  const setUploading = uploads?.setUploading;

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      setUploading?.(fieldId, false);
    },
    [fieldId, setUploading],
  );

  const upload = useCallback(
    async (file: File) => {
      controllerRef.current?.abort();
      onChange(null);
      if (!uploads?.upload) {
        const message = 'This can’t be saved here.';
        setState({ status: 'failed', message });
        uploads?.reportProblem(fieldId, message);
        return;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: 'uploading', progress: 0 });
      uploads.setUploading(fieldId, true);
      try {
        const answer = await uploads.upload(field, file, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) setState({ status: 'uploading', progress });
          },
        });
        if (controller.signal.aborted) return;
        setState({ status: 'idle' });
        onChange(answer);
      } catch (error) {
        if (isUploadCancelled(error) || controller.signal.aborted) return;
        const message = uploadErrorMessage(error);
        setState({ status: 'failed', message });
        uploads.reportProblem(fieldId, message);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        uploads.setUploading(fieldId, false);
      }
    },
    [uploads, field, fieldId, onChange],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: 'idle' });
    onChange(null);
  }, [onChange]);

  return { state, upload, reset };
}

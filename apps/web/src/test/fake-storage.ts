import type { CloudinaryUploadResult, UploadSignature } from '@formyx/shared';
import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** A signature as the API would hand it out, for `folder`. */
export function fakeSignature(folder: string, overrides: Partial<UploadSignature> = {}) {
  return {
    uploadUrl: 'https://api.cloudinary.com/v1_1/formyx-test/auto/upload',
    apiKey: 'test-key',
    timestamp: 1_700_000_000,
    signature: 'signed',
    folder,
    allowedFormats: 'pdf',
    maxBytes: 10 * 1024 * 1024,
    ...overrides,
  } satisfies UploadSignature;
}

/** What storage answers for `file` uploaded into `folder`. */
export function storedFile(folder: string, file: File): CloudinaryUploadResult {
  return {
    public_id: `${folder}/stored_${file.name}`,
    secure_url: `https://res.cloudinary.com/formyx-test/raw/upload/v1/${folder}/stored_${file.name}`,
    bytes: file.size,
    resource_type: 'raw',
  };
}

/** One upload request the page made, and the means to answer it. */
export interface FakeUpload {
  url: string;
  /** The form fields sent besides the file. */
  fields: Record<string, string>;
  file: File | null;
  aborted: boolean;
  progress: (loaded: number, total: number) => void;
  succeed: (body?: CloudinaryUploadResult) => void;
  fail: (status: number, body?: unknown) => void;
  networkError: () => void;
}

/**
 * Replaces `XMLHttpRequest`, which uploads use for their progress. Each upload waits for the
 * test to answer it, unless `autoRespond` is set: then it succeeds at once.
 */
export function stubStorageUploads({ autoRespond = false } = {}) {
  const uploads: FakeUpload[] = [];

  class FakeXhr extends EventTarget {
    readonly upload = new EventTarget();
    status = 0;
    responseText = '';
    private url = '';
    private request: FakeUpload | null = null;

    open(_method: string, url: string) {
      this.url = url;
    }

    send(body: FormData) {
      const fields: Record<string, string> = {};
      let file: File | null = null;
      for (const [key, value] of body.entries()) {
        if (typeof value === 'string') fields[key] = value;
        else file = value;
      }
      const finish = (status: number, response: unknown, type = 'load') => {
        act(() => {
          this.status = status;
          this.responseText = JSON.stringify(response);
          this.dispatchEvent(new Event(type));
        });
      };
      const request: FakeUpload = {
        url: this.url,
        fields,
        file,
        aborted: false,
        progress: (loaded, total) => {
          act(() => {
            this.upload.dispatchEvent(
              new ProgressEvent('progress', { lengthComputable: true, loaded, total }),
            );
          });
        },
        succeed: (response) => {
          finish(200, response ?? (file && storedFile(fields.folder ?? '', file)));
        },
        fail: (status, response = { error: { message: 'Upload failed' } }) => {
          finish(status, response);
        },
        networkError: () => {
          finish(0, null, 'error');
        },
      };
      this.request = request;
      uploads.push(request);
      if (autoRespond) {
        setTimeout(() => {
          if (!request.aborted) request.succeed();
        }, 0);
      }
    }

    abort() {
      if (this.request) this.request.aborted = true;
      this.dispatchEvent(new Event('abort'));
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return uploads;
}

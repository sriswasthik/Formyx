import { describe, expect, it, vi } from 'vitest';
import { fakeSignature, storedFile, stubStorageUploads } from '@/test/fake-storage';
import { jsonResponse, stubFetch } from '@/test/session';
import { ApiRequestError } from './api';
import {
  getUploadSignature,
  isUploadCancelled,
  UploadError,
  uploadErrorMessage,
  uploadToStorage,
} from './uploads';

const FOLDER = 'formyx/forms/form_1/fld_cv';
const pdf = () => new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' });

describe('getUploadSignature', () => {
  it('asks the API for a signature for one purpose', async () => {
    const fetchMock = stubFetch(() => jsonResponse(fakeSignature(FOLDER)));

    const signature = await getUploadSignature({
      purpose: 'answer',
      form: 'cv-x1',
      field: 'fld_cv',
    });

    expect(signature.folder).toBe(FOLDER);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/uploads/signature?purpose=answer&form=cv-x1&field=fld_cv',
    );
  });
});

describe('uploadToStorage', () => {
  it('posts the file with the signed fields, reporting progress', async () => {
    const uploads = stubStorageUploads();
    const onProgress = vi.fn();
    const file = pdf();

    const result = uploadToStorage(fakeSignature(FOLDER), file, { onProgress });
    const upload = uploads[0];
    if (!upload) throw new Error('Nothing was uploaded');
    upload.progress(4, 8);
    upload.succeed();

    await expect(result).resolves.toEqual(storedFile(FOLDER, file));
    expect(upload.url).toBe('https://api.cloudinary.com/v1_1/formyx-test/auto/upload');
    expect(upload.file).toBe(file);
    expect(upload.fields).toEqual({
      api_key: 'test-key',
      timestamp: '1700000000',
      signature: 'signed',
      folder: FOLDER,
      allowed_formats: 'pdf',
    });
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  it.each([
    [
      { error: { message: 'Image file format svg not allowed' } },
      'This type of file isn’t accepted here',
    ],
    [{ error: { message: 'File size too large' } }, 'This file is too big'],
    [{ unexpected: true }, 'The upload could not be completed. Try again.'],
  ])('explains a rejected upload (%o)', async (body, message) => {
    const uploads = stubStorageUploads();
    const result = uploadToStorage(fakeSignature(FOLDER), pdf());
    uploads[0]?.fail(400, body);

    await expect(result).rejects.toThrow(message);
  });

  it('fails on a lost connection, and on a response it cannot read', async () => {
    const uploads = stubStorageUploads();
    const lost = uploadToStorage(fakeSignature(FOLDER), pdf());
    uploads[0]?.networkError();
    await expect(lost).rejects.toThrow('Check your connection');

    const odd = uploadToStorage(fakeSignature(FOLDER), pdf());
    uploads[1]?.succeed({ nonsense: true } as never);
    await expect(odd).rejects.toBeInstanceOf(UploadError);
  });

  it('stops when cancelled', async () => {
    const uploads = stubStorageUploads();
    const controller = new AbortController();
    const result = uploadToStorage(fakeSignature(FOLDER), pdf(), { signal: controller.signal });

    controller.abort();

    const error: unknown = await result.catch((caught: unknown) => caught);
    expect(isUploadCancelled(error)).toBe(true);
    expect(uploads[0]?.aborted).toBe(true);
    // Nothing is sent once already cancelled.
    await expect(
      uploadToStorage(fakeSignature(FOLDER), pdf(), { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(uploads).toHaveLength(1);
  });
});

describe('uploadErrorMessage', () => {
  it.each([
    [
      new ApiRequestError(503, 'UPLOADS_UNAVAILABLE', 'x'),
      'File uploads aren’t available right now.',
    ],
    [new ApiRequestError(410, 'FORM_CLOSED', 'x'), 'This form is no longer accepting responses.'],
    [new ApiRequestError(429, 'RATE_LIMITED', 'Slow down'), 'Slow down'],
    [
      new ApiRequestError(0, 'NETWORK_ERROR', 'x'),
      'The upload could not start. Check your connection and try again.',
    ],
    [new UploadError('rejected', 'This file is too big'), 'This file is too big'],
  ])('explains %s', (error, message) => {
    expect(uploadErrorMessage(error)).toBe(message);
  });
});

import {
  createDefaultTheme,
  createEmptyForm,
  createField,
  type FileAnswer,
  type FormSchema,
} from '@formyx/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadError, type UploadOptions } from '@/lib/uploads';
import { previewUpload, type FileUploader } from './file-uploads';
import { FormView } from './form-view';

const cv = {
  ...createField('file'),
  label: 'Your CV',
  required: true,
  fileConfig: { maxSizeMb: 2, allowedTypes: ['pdf' as const] },
};
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [cv] };

const pdf = (name = 'cv.pdf') => new File(['%PDF-1.7 hello'], name, { type: 'application/pdf' });

const stored = (file: File): FileAnswer => ({
  url: `https://res.cloudinary.com/formyx-test/raw/upload/v1/forms/${file.name}`,
  publicId: `forms/${file.name}`,
  name: file.name,
  size: file.size,
  type: file.type,
});

interface Call {
  file: File;
  options: UploadOptions;
  resolve: (answer: FileAnswer) => void;
  reject: (error: unknown) => void;
}

/** An uploader that waits for the test to finish each upload. */
function controlledUploader() {
  const calls: Call[] = [];
  const upload = vi.fn<FileUploader>(
    (_field, file, options) =>
      new Promise((resolve, reject) => {
        calls.push({ file, options, resolve, reject });
      }),
  );
  const call = (index: number) => {
    const found = calls[index];
    if (!found) throw new Error(`No upload #${index}`);
    return found;
  };
  return { upload, calls, call };
}

function renderForm(uploadFile?: FileUploader) {
  const onSubmit = vi.fn(() => ({ ok: true as const }));
  render(
    <FormView
      title="Apply"
      schema={SCHEMA}
      theme={createDefaultTheme()}
      onSubmit={onSubmit}
      uploadFile={uploadFile}
    />,
  );
  // The accept attribute would quietly drop wrong files; people can still pick them.
  return { onSubmit, user: userEvent.setup({ applyAccept: false }) };
}

const fileInput = () => screen.getByLabelText(/Your CV/);
/** A problem as shown under the question (it is also announced, in a status message). */
const shownProblem = (text: string) => screen.queryByText(text, { selector: 'p:not([role])' });
const submitButton = () => screen.getByRole('button', { name: 'Submit' });

describe('FileControl', () => {
  it('uploads the chosen file with a progress bar, then sends the stored file', async () => {
    const uploader = controlledUploader();
    const { onSubmit, user } = renderForm(uploader.upload);
    const file = pdf();

    await user.upload(fileInput(), file);
    const progress = screen.getByRole('progressbar', { name: 'Uploading cv.pdf' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    act(() => {
      uploader.call(0).options.onProgress?.(0.4);
    });
    expect(progress).toHaveAttribute('aria-valuenow', '40');

    await act(async () => {
      uploader.call(0).resolve(stored(file));
      await Promise.resolve();
    });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('cv.pdf uploaded');
    // Focus stays with the control as it changes.
    expect(screen.getByRole('button', { name: 'Remove cv.pdf' })).toHaveFocus();

    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith({ [cv.id]: stored(file) });
  });

  it('turns away files that break the question’s limits, without uploading them', async () => {
    const uploader = controlledUploader();
    const { user } = renderForm(uploader.upload);

    await user.upload(fileInput(), new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(shownProblem('This type of file isn’t accepted here')).toBeInTheDocument();
    expect(fileInput()).toHaveAccessibleDescription(/This type of file isn’t accepted here/);

    const big = pdf('big.pdf');
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    await user.upload(fileInput(), big);
    expect(shownProblem('This file is too big. The limit is 2 MB')).toBeInTheDocument();

    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('explains a failed upload and tries again', async () => {
    const uploader = controlledUploader();
    const { user } = renderForm(uploader.upload);
    const file = pdf();

    await user.upload(fileInput(), file);
    await act(async () => {
      uploader.call(0).reject(new UploadError('network', 'The upload failed. Try again.'));
      await Promise.resolve();
    });
    expect(shownProblem('The upload failed. Try again.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(uploader.upload).toHaveBeenCalledTimes(2);
    expect(uploader.call(1).file).toBe(file);
    // The old problem goes once a new attempt starts.
    expect(shownProblem('The upload failed. Try again.')).not.toBeInTheDocument();
  });

  it('waits for an upload before sending the form', async () => {
    const uploader = controlledUploader();
    const { onSubmit, user } = renderForm(uploader.upload);

    await user.upload(fileInput(), pdf());
    await user.click(submitButton());

    expect(screen.getByText('Wait for the file to finish uploading')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels an upload, back to choosing a file', async () => {
    const uploader = controlledUploader();
    const { user } = renderForm(uploader.upload);

    await user.upload(fileInput(), pdf());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(uploader.call(0).options.signal?.aborted).toBe(true);
    expect(fileInput()).toHaveFocus();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('removes an uploaded file', async () => {
    const { onSubmit, user } = renderForm(previewUpload);

    await user.upload(fileInput(), pdf());
    await user.click(await screen.findByRole('button', { name: 'Remove cv.pdf' }));
    await user.click(submitButton());

    expect(within(screen.getByRole('alert')).getByText(/1 question/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('turns files away where they cannot be uploaded', async () => {
    const { user } = renderForm();
    await user.upload(fileInput(), pdf());
    expect(shownProblem('Files can’t be uploaded here.')).toBeInTheDocument();
  });
});

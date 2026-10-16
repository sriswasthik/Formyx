import { z } from 'zod';

/** How long a finished export can be downloaded. */
export const DATA_EXPORT_DAYS = 7;

/** One export of someone's data (`GET /api/account/exports`). */
export const dataExportSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'READY', 'FAILED', 'EXPIRED']),
  createdAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  /** The ZIP's size, once it is ready. */
  bytes: z.number().int().nullable(),
});
export type DataExport = z.infer<typeof dataExportSchema>;

export const dataExportsSchema = z.object({ exports: z.array(dataExportSchema) });
export type DataExports = z.infer<typeof dataExportsSchema>;

/** The files of an export, besides one folder per form: what each holds. */
export const DATA_EXPORT_README = `Your Formyx data

account.json          Your account: name, email address, preferences and sign-in methods.
workspaces.json       The workspaces you belong to, your role in each, and their members
                      for the ones you own.
forms/<form>/form.json       Each form you can see in a workspace you own: its questions,
                             settings and look, as published and as drafted.
forms/<form>/responses.json  Every response to it, with all its answers.
forms/<form>/responses.csv   The same responses, as a spreadsheet.

Uploaded files are listed by link; open them while signed in to Formyx.
`;

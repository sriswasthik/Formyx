import { z } from 'zod';
import { NODE_ID_PATTERN } from './forms/ids.js';

/*
 * Uploads go straight from the browser to Cloudinary. The API only signs the request, which
 * pins the folder and the allowed formats, and checks the result before using it.
 */

/** Logos, cover images and background images. */
export const THEME_IMAGE_MAX_MB = 5;
export const THEME_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

/** `content`: pictures inside the form, such as picture choices and image blocks. */
export const THEME_IMAGE_KINDS = ['logo', 'cover', 'background', 'content'] as const;
export const themeImageKindSchema = z.enum(THEME_IMAGE_KINDS);
export type ThemeImageKind = z.infer<typeof themeImageKindSchema>;

/** Query string of `GET /api/uploads/signature`. */
export const uploadSignatureQuerySchema = z.discriminatedUnion('purpose', [
  /**
   * A respondent's upload, for a file, signature or voice-note question of a published form.
   * No account needed.
   */
  z.object({
    purpose: z.literal('answer'),
    form: z.string().min(1).max(200),
    field: z.string().regex(NODE_ID_PATTERN),
  }),
  /** A form's logo, cover or background image, for editors. */
  z.object({
    purpose: themeImageKindSchema,
    formId: z.string().min(1).max(64),
  }),
]);
export type UploadSignatureQuery = z.input<typeof uploadSignatureQuerySchema>;

/** Everything the browser sends to Cloudinary, besides the file itself. */
export const uploadSignatureSchema = z.object({
  /** POST the file here as multipart form data. */
  uploadUrl: z.url(),
  apiKey: z.string(),
  timestamp: z.number().int(),
  signature: z.string(),
  folder: z.string(),
  /** Comma-separated, as Cloudinary expects it; part of the signature. */
  allowedFormats: z.string(),
  /** The most bytes the API will accept once uploaded. */
  maxBytes: z.number().int().min(1),
  /**
   * `private` for respondents' files: stored where only Formyx can hand them out, through
   * short-lived links after checking who asks. Part of the signature.
   */
  type: z.literal('private').optional(),
});
export type UploadSignature = z.infer<typeof uploadSignatureSchema>;

/** The parts of Cloudinary's upload response the app uses. */
export const cloudinaryUploadResultSchema = z.object({
  public_id: z.string(),
  secure_url: z.url(),
  bytes: z.number().int(),
  format: z.string().optional(),
  resource_type: z.string(),
});
export type CloudinaryUploadResult = z.infer<typeof cloudinaryUploadResultSchema>;

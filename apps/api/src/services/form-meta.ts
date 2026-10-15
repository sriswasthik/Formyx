import { readLiveSettings, type EntitlementsMode, type FormMeta } from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { renderSocialImage } from '../lib/social-image.js';
import { formAllows } from './entitlement-service.js';
import { parsePublishedSchema, parsePublishedTheme } from './form-service.js';

/*
 * What a published form's page says about it before any script runs: its title, description,
 * preview image, icon and whether search engines may list it. Read by the site's edge
 * function, which writes them into the page, so links shared in chats show the form.
 */

/** Generated images kept in memory, newest last; each is about 50 KB. */
const IMAGE_CACHE_SIZE = 50;

export interface FormMetaService {
  meta(slug: string): Promise<FormMeta>;
  /** The generated preview image, or where the form's own image is. */
  image(slug: string): Promise<{ png: Buffer } | { redirect: string }>;
}

async function findBySlug(prisma: Database, slug: string) {
  const select = {
    id: true,
    slug: true,
    title: true,
    publishedTitle: true,
    publishedSchema: true,
    publishedTheme: true,
    theme: true,
    publishedAt: true,
    liveSettings: true,
    status: true,
    createdBy: { select: { suspendedAt: true } },
  } as const;
  const current = await prisma.form.findUnique({ where: { slug }, select });
  if (current) return current;
  const old = await prisma.formSlug.findUnique({ where: { slug }, select: { formId: true } });
  return old ? prisma.form.findUnique({ where: { id: old.formId }, select }) : null;
}

export function createFormMetaService(
  prisma: Database,
  appUrl: string,
  mode: EntitlementsMode,
): FormMetaService {
  const images = new Map<string, Buffer>();

  async function load(slug: string) {
    const form = await findBySlug(prisma, slug);
    const schema = form && parsePublishedSchema(form.publishedSchema);
    // Held for review or taken offline: no preview, so nothing of it travels with a link.
    const offline =
      form?.status === 'UNDER_REVIEW' ||
      form?.status === 'SUSPENDED' ||
      Boolean(form?.createdBy?.suspendedAt);
    if (!form || !schema || !form.publishedAt || offline) {
      throw new AppError(404, 'NOT_FOUND', 'Form not found');
    }
    const settings = readLiveSettings(form.liveSettings);
    const { access } = settings;
    let { sharing } = settings;
    // A form's own image and icon need the plan; without it, the generated ones show.
    if (
      (sharing.socialImageUrl || sharing.faviconUrl) &&
      !(await formAllows(prisma, mode, form.id, 'custom_social'))
    ) {
      const { socialImageUrl: _image, faviconUrl: _icon, ...rest } = sharing;
      sharing = rest;
    }
    return {
      form,
      schema,
      sharing,
      access,
      title: sharing.socialTitle || form.publishedTitle || form.title,
      description: sharing.socialDescription || schema.description?.trim() || undefined,
    };
  }

  return {
    async meta(slug) {
      const { form, sharing, access, title, description } = await load(slug);
      // The version changes with each publish, so previews pick up a new look.
      const version = form.publishedAt?.getTime() ?? 0;
      return {
        slug: form.slug,
        title,
        ...(description && { description }),
        imageUrl:
          sharing.socialImageUrl ??
          `${appUrl}/api/public/forms/${encodeURIComponent(form.slug)}/og.png?v=${version}`,
        ...(sharing.faviconUrl && { faviconUrl: sharing.faviconUrl }),
        indexable: !access.unlisted,
      };
    },

    async image(slug) {
      const { form, sharing, title, description } = await load(slug);
      if (sharing.socialImageUrl) return { redirect: sharing.socialImageUrl };
      const theme = parsePublishedTheme(form.publishedTheme ?? form.theme);
      if (!theme) throw new AppError(404, 'NOT_FOUND', 'Form not found');
      const key = `${form.id}:${form.publishedAt?.getTime() ?? 0}:${title}:${description ?? ''}`;
      const cached = images.get(key);
      if (cached) return { png: cached };
      const png = await renderSocialImage({ title, description, theme });
      images.set(key, png);
      if (images.size > IMAGE_CACHE_SIZE) {
        const oldest = images.keys().next().value;
        if (oldest !== undefined) images.delete(oldest);
      }
      return { png };
    },
  };
}

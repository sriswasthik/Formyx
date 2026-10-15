import {
  extractFormLinks,
  matchedRuleIds,
  matchedRuleLabels,
  moderateForm,
  type FormSchema,
} from '@formyx/shared';
import { z } from 'zod';
import type { LinkChecker } from './link-checker.js';

/*
 * What publishing's checks found for a form, kept in `forms.moderation`, and what an admin
 * approved. Approval covers what was found: publishing the same again goes straight out, while
 * something new (another rule, another unsafe link) holds the form for review again.
 */

const matchSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  path: z.string(),
  excerpt: z.string(),
});

const unsafeLinkSchema = z.object({ url: z.string(), reason: z.string() });

export const formModerationRecordSchema = z.object({
  /** What the rules found the last time it was published, when they held it. */
  matches: z.array(matchSchema).default([]),
  /** Links found unsafe the last time it was published. */
  unsafeLinks: z.array(unsafeLinkSchema).default([]),
  checkedAt: z.iso.datetime().optional(),
  /** Why it is (or was last) held: its content when published, or reports from visitors. */
  heldFor: z.enum(['content', 'reports']).optional(),
  /** Rules and links an admin looked at and let through. */
  approvedRuleIds: z.array(z.string()).default([]),
  approvedLinks: z.array(z.string()).default([]),
  reviewedAt: z.iso.datetime().optional(),
});
export type FormModerationRecord = z.infer<typeof formModerationRecordSchema>;

const EMPTY: FormModerationRecord = {
  matches: [],
  unsafeLinks: [],
  approvedRuleIds: [],
  approvedLinks: [],
};

/** A stored record; anything unreadable counts as never checked. */
export function readModeration(value: unknown): FormModerationRecord {
  const parsed = formModerationRecordSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : EMPTY;
}

export interface PublishReview {
  /** Hold the form for review instead of putting it live. */
  hold: boolean;
  record: FormModerationRecord;
}

/** The checks for a form about to be published, given what was approved before. */
export async function reviewForPublish({
  schema,
  title,
  previous,
  links,
  now = new Date(),
}: {
  schema: FormSchema;
  title: string;
  previous: FormModerationRecord;
  links: LinkChecker;
  now?: Date;
}): Promise<PublishReview> {
  const result = moderateForm(schema, title);
  const unsafeLinks = await links.check(extractFormLinks(schema));
  const newRules = result.flagged
    ? matchedRuleIds(result.matches).filter((id) => !previous.approvedRuleIds.includes(id))
    : [];
  const newLinks = unsafeLinks.filter((link) => !previous.approvedLinks.includes(link.url));
  const hold = newRules.length > 0 || newLinks.length > 0;
  return {
    hold,
    record: {
      ...previous,
      matches: result.flagged ? result.matches : [],
      unsafeLinks,
      checkedAt: now.toISOString(),
      ...(hold && { heldFor: 'content' as const }),
    },
  };
}

/** An admin let the form through: what it was held for is approved from now on. */
export function approveModeration(
  record: FormModerationRecord,
  now: Date = new Date(),
): FormModerationRecord {
  return {
    ...record,
    approvedRuleIds: [...new Set([...record.approvedRuleIds, ...matchedRuleIds(record.matches)])],
    approvedLinks: [
      ...new Set([...record.approvedLinks, ...record.unsafeLinks.map((link) => link.url)]),
    ],
    reviewedAt: now.toISOString(),
  };
}

/** What the creator is told about a held form: "asks for a password", and so on. */
export function reviewReasons(record: FormModerationRecord): string[] {
  if (record.heldFor === 'reports') return ['was reported by people who saw it'];
  return [
    ...matchedRuleLabels(record.matches),
    ...(record.unsafeLinks.length > 0 ? ['links to a site on a list of unsafe sites'] : []),
  ];
}

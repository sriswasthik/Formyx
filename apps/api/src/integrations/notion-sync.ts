import {
  notionConfigSchema,
  notionIdProperty,
  planNotionProperties,
  type NotionConfig,
  type SubmissionRecord,
} from '@formyx/shared';
import type { Env } from '../config/env.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { submissionBatches } from '../services/submission-service.js';
import { openCredentials, CredentialsError } from './credentials.js';
import { createNotionClient, NotionApiError, type NotionClient } from './notion.js';
import type { SheetForm } from './sheets-sync.js';

/*
 * Keeping a Notion database in step with a form: a page per response, a property per
 * column. Which page holds which response is kept in integration_records, so a changed
 * response updates its page; when that link is missing (a retry after a crash), the page is
 * looked up by its Response ID before a new one is made.
 */

interface NotionIntegration {
  id: string;
  formId: string;
  config: unknown;
  credentialsEncrypted: string | null;
}

export function notionSync({
  env,
  prisma,
  encryption,
}: {
  env: Env;
  prisma: Database;
  encryption: Encryption;
}) {
  function clientFor(integration: NotionIntegration): NotionClient {
    const credentials = openCredentials(encryption, integration.credentialsEncrypted);
    if (credentials.kind !== 'notion') throw new CredentialsError();
    return createNotionClient(env, credentials.accessToken);
  }

  /**
   * Makes the database if needed (in a page people shared) and brings its properties up to
   * date. `start` begins again: a new database, and with `newParent` a newly chosen page too.
   */
  async function prepare(
    client: NotionClient,
    integration: NotionIntegration,
    form: SheetForm,
    start: 'keep' | 'newDatabase' | 'newParent',
  ) {
    const stored: NotionConfig = notionConfigSchema.parse(integration.config ?? {});
    const keepDatabase = start === 'keep' && stored.databaseId !== undefined;
    let parent =
      start !== 'newParent' && stored.parentPageId
        ? { id: stored.parentPageId, title: stored.parentTitle ?? '' }
        : null;
    if (!parent) {
      const [page] = await client.sharedPages();
      if (!page) {
        throw new NotionApiError(
          400,
          'Share a page with Formyx in Notion (while connecting), so it has somewhere to put the database.',
        );
      }
      parent = page;
    }

    const plan = planNotionProperties(
      keepDatabase ? stored.properties : null,
      form.schema,
      form.sources,
    );
    const propertySpec = (type: string) => ({ [type]: {} });
    let database = keepDatabase ? { id: stored.databaseId ?? '', url: stored.databaseUrl } : null;
    if (!database) {
      database = await client.createDatabase(
        parent.id,
        `${form.title.trim() || 'Untitled form'} responses`,
        Object.fromEntries(plan.properties.map((p) => [p.name, propertySpec(p.type)])),
      );
    } else if (plan.added.length > 0 || plan.renamed.length > 0) {
      await client.updateDatabase(database.id, {
        ...Object.fromEntries(plan.renamed.map(({ from, to }) => [from, { name: to }])),
        ...Object.fromEntries(plan.added.map((p) => [p.name, propertySpec(p.type)])),
      });
    }
    const config: NotionConfig = {
      parentPageId: parent.id,
      parentTitle: parent.title,
      databaseId: database.id,
      ...(database.url && { databaseUrl: database.url }),
      properties: plan.properties,
    };
    await prisma.integration.update({ where: { id: integration.id }, data: { config } });
    return {
      databaseId: database.id,
      idProperty: notionIdProperty(plan.properties),
      values: plan.values,
    };
  }

  async function writeOne(
    client: NotionClient,
    integration: NotionIntegration,
    prepared: Awaited<ReturnType<typeof prepare>>,
    submission: SubmissionRecord,
  ) {
    const properties = prepared.values(submission);
    const record = await prisma.integrationRecord.findUnique({
      where: {
        integrationId_submissionId: { integrationId: integration.id, submissionId: submission.id },
      },
      select: { externalId: true },
    });
    let pageId =
      record?.externalId ??
      (prepared.idProperty
        ? await client.findPage(prepared.databaseId, prepared.idProperty, submission.id)
        : null);
    if (pageId) {
      await client.updatePage(pageId, properties);
    } else {
      pageId = (await client.createPage(prepared.databaseId, properties)).id;
    }
    await prisma.integrationRecord.upsert({
      where: {
        integrationId_submissionId: { integrationId: integration.id, submissionId: submission.id },
      },
      create: { integrationId: integration.id, submissionId: submission.id, externalId: pageId },
      update: { externalId: pageId },
    });
  }

  return {
    /** Every response without a page yet; with `fresh`, all of them into a new database. */
    async backfill(integration: NotionIntegration, form: SheetForm, fresh: boolean) {
      const client = clientFor(integration);
      let prepared;
      try {
        prepared = await prepare(client, integration, form, fresh ? 'newDatabase' : 'keep');
      } catch (error) {
        // The database (or the page it was in) was deleted or unshared: start again.
        if (!(error instanceof NotionApiError) || error.status !== 404) throw error;
        prepared = await prepare(client, integration, form, 'newParent');
        fresh = true;
      }
      if (fresh) {
        await prisma.integrationRecord.deleteMany({ where: { integrationId: integration.id } });
      }
      const done = new Set(
        (
          await prisma.integrationRecord.findMany({
            where: { integrationId: integration.id },
            select: { submissionId: true },
          })
        ).map(({ submissionId }) => submissionId),
      );
      for await (const batch of submissionBatches(prisma, integration.formId, {
        order: 'oldest',
        size: 100,
      })) {
        for (const submission of batch) {
          if (done.has(submission.id)) continue;
          // Pages one at a time: Notion allows about three requests a second.
          await writeOne(client, integration, prepared, submission);
        }
      }
    },

    async write(integration: NotionIntegration, form: SheetForm, submission: SubmissionRecord) {
      const client = clientFor(integration);
      const prepared = await prepare(client, integration, form, 'keep');
      await writeOne(client, integration, prepared, submission);
    },
  };
}

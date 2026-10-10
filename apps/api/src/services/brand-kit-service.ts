import {
  brandKitDataSchema,
  type BrandKit,
  type BrandKitData,
  type BrandKitInput,
  type BrandKitsResponse,
  type BrandKitUpdate,
} from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import type { EntitlementService } from './entitlement-service.js';

export interface BrandKitService {
  /** The workspace's kits, newest first, and which one new forms start with. */
  list(workspaceId: string): Promise<BrandKitsResponse>;
  /** Throws 403 LIMIT_REACHED once the workspace has as many kits as its plan allows. */
  create(workspaceId: string, userId: string, input: BrandKitInput): Promise<BrandKit>;
  update(workspaceId: string, brandKitId: string, patch: BrandKitUpdate): Promise<BrandKit>;
  /** Deletes a kit; a workspace that started new forms with it goes back to the plain look. */
  remove(workspaceId: string, brandKitId: string): Promise<void>;
  /** The kit new forms start with, or `null` for none. */
  setDefault(workspaceId: string, brandKitId: string | null): Promise<BrandKitsResponse>;
  /** The workspace's default kit, if it has one, for a new form. */
  defaultKit(workspaceId: string): Promise<BrandKitData | null>;
  /** Every logo the workspace's kits use, so forms may take them on. */
  logoUrls(workspaceId: string): Promise<string[]>;
}

interface BrandKitRecord {
  id: string;
  name: string;
  kit: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const kitSelect = { id: true, name: true, kit: true, createdAt: true, updatedAt: true } as const;

function parseKit(value: unknown): BrandKitData {
  const result = brandKitDataSchema.safeParse(value);
  if (!result.success) throw new Error('Stored brand kit does not match its schema');
  return result.data;
}

function toBrandKit(record: BrandKitRecord): BrandKit {
  return {
    id: record.id,
    name: record.name,
    kit: parseKit(record.kit),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** The kit a workspace starts new forms with, if it has one. */
export async function workspaceDefaultKit(
  prisma: Database,
  workspaceId: string,
): Promise<BrandKitData | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { defaultBrandKit: { select: { kit: true } } },
  });
  const stored = workspace?.defaultBrandKit?.kit;
  return stored === undefined ? null : parseKit(stored);
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Brand kit not found');
}

export function createBrandKitService(
  prisma: Database,
  entitlements: EntitlementService,
): BrandKitService {
  async function list(workspaceId: string): Promise<BrandKitsResponse> {
    const [kits, workspace] = await Promise.all([
      prisma.brandKit.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: kitSelect,
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { defaultBrandKitId: true },
      }),
    ]);
    return {
      brandKits: kits.map(toBrandKit),
      defaultBrandKitId: workspace?.defaultBrandKitId ?? null,
    };
  }

  /** The kit, if it belongs to the workspace. */
  async function find(workspaceId: string, brandKitId: string) {
    const kit = await prisma.brandKit.findFirst({
      where: { id: brandKitId, workspaceId },
      select: kitSelect,
    });
    if (!kit) throw notFound();
    return kit;
  }

  return {
    list,

    async create(workspaceId, userId, { name, kit }) {
      // The plan's limit (none while every workspace has everything, see ENTITLEMENTS_MODE).
      const max = (await entitlements.forWorkspace(workspaceId)).limits.brand_kits;
      if (max !== null) {
        const count = await prisma.brandKit.count({ where: { workspaceId } });
        if (count >= max) {
          throw new AppError(
            403,
            'LIMIT_REACHED',
            max === 1
              ? 'Your plan includes one brand kit. Edit or delete it to make room.'
              : `Your plan includes ${max} brand kits. Delete one to make room.`,
            { details: { limit: 'brand_kits', max } },
          );
        }
      }
      const created = await prisma.brandKit.create({
        data: { workspaceId, createdById: userId, name, kit },
        select: kitSelect,
      });
      return toBrandKit(created);
    },

    async update(workspaceId, brandKitId, { name, kit }) {
      await find(workspaceId, brandKitId);
      const updated = await prisma.brandKit.update({
        where: { id: brandKitId },
        data: { ...(name !== undefined && { name }), ...(kit !== undefined && { kit }) },
        select: kitSelect,
      });
      return toBrandKit(updated);
    },

    async remove(workspaceId, brandKitId) {
      await find(workspaceId, brandKitId);
      // The workspace's default clears itself (ON DELETE SET NULL).
      await prisma.brandKit.delete({ where: { id: brandKitId } });
    },

    async setDefault(workspaceId, brandKitId) {
      if (brandKitId !== null) await find(workspaceId, brandKitId);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { defaultBrandKitId: brandKitId },
      });
      return list(workspaceId);
    },

    defaultKit(workspaceId) {
      return workspaceDefaultKit(prisma, workspaceId);
    },

    async logoUrls(workspaceId) {
      const kits = await prisma.brandKit.findMany({
        where: { workspaceId },
        select: { kit: true },
      });
      return kits.flatMap(({ kit }) => {
        const logoUrl = parseKit(kit).logoUrl;
        return logoUrl ? [logoUrl] : [];
      });
    },
  };
}

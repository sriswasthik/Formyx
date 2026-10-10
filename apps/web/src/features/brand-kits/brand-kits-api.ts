import {
  brandKitSchema,
  brandKitsResponseSchema,
  type BrandKit,
  type BrandKitInput,
  type BrandKitsResponse,
  type BrandKitUpdate,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, jsonRequest } from '@/lib/api';

const kitsPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/brand-kits`;
const kitPath = (workspaceId: string, brandKitId: string) =>
  `${kitsPath(workspaceId)}/${encodeURIComponent(brandKitId)}`;

export function listBrandKits(workspaceId: string): Promise<BrandKitsResponse> {
  return apiRequest(kitsPath(workspaceId), brandKitsResponseSchema);
}

export function createBrandKit(workspaceId: string, input: BrandKitInput): Promise<BrandKit> {
  return apiRequest(kitsPath(workspaceId), brandKitSchema, jsonRequest('POST', input));
}

export function updateBrandKit(
  workspaceId: string,
  brandKitId: string,
  patch: BrandKitUpdate,
): Promise<BrandKit> {
  return apiRequest(kitPath(workspaceId, brandKitId), brandKitSchema, jsonRequest('PATCH', patch));
}

export async function deleteBrandKit(workspaceId: string, brandKitId: string): Promise<void> {
  await apiRequest(kitPath(workspaceId, brandKitId), z.undefined(), { method: 'DELETE' });
}

export function setDefaultBrandKit(
  workspaceId: string,
  brandKitId: string | null,
): Promise<BrandKitsResponse> {
  return apiRequest(
    `/workspaces/${encodeURIComponent(workspaceId)}/default-brand-kit`,
    brandKitsResponseSchema,
    jsonRequest('PUT', { brandKitId }),
  );
}

export const brandKitKeys = {
  workspace: (workspaceId: string) => ['workspaces', workspaceId, 'brand-kits'] as const,
};

export function useBrandKits(workspaceId: string) {
  return useQuery({
    queryKey: brandKitKeys.workspace(workspaceId),
    queryFn: () => listBrandKits(workspaceId),
  });
}

/** Saving, renaming, deleting kits and choosing the default, each updating the list. */
export function useBrandKitMutations(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = brandKitKeys.workspace(workspaceId);
  const patchList = (change: (current: BrandKitsResponse) => BrandKitsResponse) => {
    queryClient.setQueryData<BrandKitsResponse>(key, (current) =>
      current ? change(current) : current,
    );
  };

  return {
    create: useMutation({
      mutationFn: (input: BrandKitInput) => createBrandKit(workspaceId, input),
      onSuccess: (kit) => {
        patchList((current) => ({ ...current, brandKits: [kit, ...current.brandKits] }));
      },
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: BrandKitUpdate }) =>
        updateBrandKit(workspaceId, id, patch),
      onSuccess: (kit) => {
        patchList((current) => ({
          ...current,
          brandKits: current.brandKits.map((existing) => (existing.id === kit.id ? kit : existing)),
        }));
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteBrandKit(workspaceId, id),
      onSuccess: (_result, id) => {
        patchList((current) => ({
          brandKits: current.brandKits.filter((kit) => kit.id !== id),
          defaultBrandKitId: current.defaultBrandKitId === id ? null : current.defaultBrandKitId,
        }));
      },
    }),
    setDefault: useMutation({
      mutationFn: (id: string | null) => setDefaultBrandKit(workspaceId, id),
      onSuccess: (list) => {
        queryClient.setQueryData(key, list);
      },
    }),
  };
}

import {
  entitlementsSchema,
  missingFeatures,
  type Entitlements,
  type FeatureId,
  type LimitId,
  type LimitValue,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { apiRequest } from '@/lib/api';

export const entitlementKeys = {
  workspace: (workspaceId: string) => ['entitlements', workspaceId] as const,
};

export function getEntitlements(workspaceId: string): Promise<Entitlements> {
  return apiRequest(
    `/workspaces/${encodeURIComponent(workspaceId)}/entitlements`,
    entitlementsSchema,
  );
}

export interface UseEntitlements {
  /** `undefined` until loaded (or if loading failed). */
  entitlements: Entitlements | undefined;
  /** Whether plans decide what the workspace may use, rather than everything being unlocked. */
  enforced: boolean;
  /**
   * Whether the workspace's plan includes the feature. While unknown it counts as included:
   * the API checks again when it matters (publishing), and says if it is not.
   */
  hasFeature: (featureId: FeatureId) => boolean;
  /** How much the plan allows; `null` for no limit (or while unknown). */
  getLimit: (limitId: LimitId) => LimitValue;
  /** Which of `featureIds` the plan lacks, in registry order; none while unknown. */
  missing: (featureIds: readonly FeatureId[]) => FeatureId[];
}

/** Questions about `entitlements`, answered with the shared helpers. */
export function describeEntitlements(entitlements: Entitlements | undefined): UseEntitlements {
  return {
    entitlements,
    enforced: entitlements?.mode === 'enforced',
    hasFeature: (featureId) => entitlements?.features[featureId] ?? true,
    getLimit: (limitId) => entitlements?.limits[limitId] ?? null,
    missing: (featureIds) => (entitlements ? missingFeatures(entitlements, featureIds) : []),
  };
}

/** Before anything is known: nothing is held back here, and the API has the last word. */
export const UNKNOWN_ENTITLEMENTS: UseEntitlements = describeEntitlements(undefined);

/**
 * What a workspace's plan includes, as the API resolved it with the shared `hasFeature` and
 * `getLimit`. Never compare plan names in components: ask this hook.
 */
export function useWorkspaceEntitlements(workspaceId: string | undefined): UseEntitlements {
  const { data } = useQuery({
    queryKey: entitlementKeys.workspace(workspaceId ?? ''),
    queryFn: () => getEntitlements(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
    // Plans change rarely; a reload or a refused publish brings news sooner.
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => describeEntitlements(data), [data]);
}

/** `useWorkspaceEntitlements` for the workspace the user is working in. */
export function useEntitlements(): UseEntitlements {
  return useWorkspaceEntitlements(useActiveWorkspace()?.id);
}

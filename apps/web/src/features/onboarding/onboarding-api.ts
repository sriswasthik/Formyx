import {
  onboardingResponseSchema,
  type OnboardingResponse,
  type UpdateOnboardingInput,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, jsonRequest } from '@/lib/api';

export const onboardingKeys = {
  all: ['account', 'onboarding'] as const,
};

export function getOnboarding(): Promise<OnboardingResponse> {
  return apiRequest('/account/onboarding', onboardingResponseSchema);
}

export function updateOnboarding(input: UpdateOnboardingInput): Promise<OnboardingResponse> {
  return apiRequest('/account/onboarding', onboardingResponseSchema, jsonRequest('PATCH', input));
}

/** The welcome and the checklist. Read again whenever the dashboard opens: steps get done elsewhere. */
export function useOnboarding() {
  return useQuery({ queryKey: onboardingKeys.all, queryFn: getOnboarding, staleTime: 0 });
}

/** Saves a change, showing it at once (the welcome closes, the checklist goes). */
export function useUpdateOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOnboarding,
    onMutate: (input) => {
      const previous = queryClient.getQueryData<OnboardingResponse>(onboardingKeys.all);
      queryClient.setQueryData<OnboardingResponse>(
        onboardingKeys.all,
        (current) =>
          current && {
            welcome: input.welcomed ? false : current.welcome,
            useCase: input.useCase ?? current.useCase,
            checklist: input.checklistDismissed ? null : current.checklist,
          },
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(onboardingKeys.all, context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(onboardingKeys.all, saved);
    },
  });
}

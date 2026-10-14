import type { FormSummary, FormTemplateId } from '@formyx/shared';
import { AnimatePresence, m } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useMe } from '@/features/auth/use-session';
import { ShareDialog } from '@/features/forms/share/share-dialog';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { GettingStarted } from './getting-started';
import { useOnboarding, useUpdateOnboarding } from './onboarding-api';

// Shown once per account, and it draws template thumbnails: loaded only when it is needed.
const WelcomeDialog = lazy(async () => ({
  default: (await import('./welcome-dialog')).WelcomeDialog,
}));

interface DashboardOnboardingProps {
  /** The welcome waits while a gallery link is making a form. */
  arrivedWithTemplate: boolean;
  /** The workspace's forms, once loaded. */
  forms: readonly FormSummary[] | undefined;
  onNewForm: () => void;
  onCreate: (templateId: FormTemplateId) => void;
  pending: boolean;
}

/** The welcome after sign-up and the getting-started checklist, for people who can make forms. */
export function DashboardOnboarding({
  arrivedWithTemplate,
  forms,
  onNewForm,
  onCreate,
  pending,
}: DashboardOnboardingProps) {
  const { data: me } = useMe();
  const { data: onboarding } = useOnboarding();
  const { mutate: update } = useUpdateOnboarding();
  const [sharing, setSharing] = useState<FormSummary | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const checklist = forms && onboarding?.checklist;

  // Someone who signed up through "Use this template" has already chosen where to start. Sent
  // straight away: the page leaves for the new form before the welcome would have loaded.
  useEffect(() => {
    if (arrivedWithTemplate) update({ welcomed: true });
  }, [arrivedWithTemplate, update]);

  return (
    <>
      <AnimatePresence initial={false}>
        {checklist && (
          <m.div
            key="getting-started"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
          >
            <GettingStarted
              steps={checklist}
              forms={forms}
              onCreateForm={onNewForm}
              onShare={(form) => {
                setSharing(form);
                setShareOpen(true);
              }}
              onDismiss={() => {
                update({ checklistDismissed: true });
              }}
            />
          </m.div>
        )}
      </AnimatePresence>

      {onboarding?.welcome && !arrivedWithTemplate && (
        <Suspense fallback={null}>
          <WelcomeDialog
            name={me?.user.name ?? ''}
            initialUseCase={onboarding.useCase}
            onUseCase={(useCase) => {
              update({ useCase });
            }}
            onCreate={(templateId) => {
              update({ welcomed: true });
              onCreate(templateId);
            }}
            onSkip={() => {
              update({ welcomed: true });
            }}
            pending={pending}
          />
        </Suspense>
      )}

      {sharing && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          slug={sharing.slug}
          closed={false}
          justPublished={false}
        />
      )}
    </>
  );
}

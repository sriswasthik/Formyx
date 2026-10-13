import {
  FORM_LANGUAGE_NAMES,
  FORM_LANGUAGES,
  MOTION_PREFERENCES,
  type FormLanguage,
  type MotionPreference,
} from '@formyx/shared';
import { useId } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  useAccountPreferences,
  useUpdateAccountPreferences,
} from '@/features/account/use-account-preferences';
import { OptionSelect } from '@/features/form-settings/sections/section-controls';
import { parseMotionPreference, useMotionStore } from '@/features/motion/motion-preference';
import { changeErrorMessage } from '@/lib/api';

const MOTION_OPTIONS: Record<MotionPreference, { label: string; hint: string }> = {
  system: { label: 'Match my device', hint: 'Less motion if your device asks for it.' },
  reduce: { label: 'Reduce motion', hint: 'Things appear and change without moving.' },
  full: { label: 'Allow motion', hint: 'Animate even if your device asks for less.' },
};

/** How much the app moves: saved to the account, applied at once. */
export function MotionCard() {
  const preference = useMotionStore((state) => state.preference);
  const setPreference = useMotionStore((state) => state.setPreference);
  const titleId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle id={titleId}>Motion</CardTitle>
        <CardDescription>Animations in Formyx, on every device you sign in on.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          aria-labelledby={titleId}
          value={preference}
          onValueChange={(value) => {
            setPreference(parseMotionPreference(value));
          }}
          className="flex flex-col gap-3"
        >
          {MOTION_PREFERENCES.map((value) => (
            <div key={value} className="flex items-start gap-2.5">
              <RadioGroupItem
                id={`motion-${value}`}
                value={value}
                aria-describedby={`motion-${value}-hint`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`motion-${value}`} className="text-14">
                  {MOTION_OPTIONS[value].label}
                </Label>
                <p id={`motion-${value}-hint`} className="text-13 text-muted-foreground">
                  {MOTION_OPTIONS[value].hint}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

const LANGUAGE_OPTIONS = FORM_LANGUAGES.map((language) => {
  const { native, english } = FORM_LANGUAGE_NAMES[language];
  return { value: language, label: native === english ? native : `${native} (${english})` };
});

/** The language new forms start in, and the emails this person wants. */
export function FormDefaultsCard() {
  const preferences = useAccountPreferences();
  const update = useUpdateAccountPreferences();
  const languageId = useId();
  const emailId = useId();

  const save = (patch: { language?: FormLanguage; emailOnNewForms?: boolean }) => {
    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Preference saved');
      },
      onError: (error) => {
        toast.error('Could not save the preference', { description: changeErrorMessage(error) });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New forms</CardTitle>
        <CardDescription>
          How the forms you create start out. Each form can change these in its settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {preferences.data ? (
          <>
            <div className="flex flex-col gap-1.5 sm:max-w-80">
              <Label htmlFor={languageId}>Language for respondents</Label>
              <OptionSelect
                id={languageId}
                value={preferences.data.language}
                options={LANGUAGE_OPTIONS}
                onChange={(language) => {
                  save({ language });
                }}
              />
              <p className="text-13 text-muted-foreground">
                Buttons, messages and emails respondents see. Formyx itself stays in English.
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={emailId}>Email me about responses</Label>
                <p className="text-13 text-muted-foreground">
                  Turned on for each form you create, as its responses arrive.
                </p>
              </div>
              <Switch
                id={emailId}
                checked={preferences.data.emailOnNewForms}
                onCheckedChange={(emailOnNewForms) => {
                  save({ emailOnNewForms });
                }}
              />
            </div>
          </>
        ) : preferences.isError ? (
          <p role="alert" className="text-14 text-danger-text">
            Could not load your preferences. Reload the page to try again.
          </p>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading preferences">
            <Skeleton className="h-9 w-full sm:w-80" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Whether this person's use of Formyx counts in product analytics, and which emails they get. */
export function PrivacyCard() {
  const preferences = useAccountPreferences();
  const update = useUpdateAccountPreferences();
  const analyticsId = useId();
  const emailsId = useId();

  const save = (patch: { productAnalytics?: boolean; productEmails?: boolean }) => {
    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Preference saved');
      },
      onError: (error) => {
        toast.error('Could not save the preference', { description: changeErrorMessage(error) });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy</CardTitle>
        <CardDescription>
          What Formyx learns from how you use it, and what it emails you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {preferences.data ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={analyticsId}>Share feature usage</Label>
                <p className="text-13 text-muted-foreground">
                  Counts which features you use, such as publishing or a premium font, under an id
                  that can’t be traced back to you, so we learn what to improve. Never your name,
                  email, forms or responses.
                </p>
              </div>
              <Switch
                id={analyticsId}
                checked={preferences.data.productAnalytics}
                onCheckedChange={(productAnalytics) => {
                  save({ productAnalytics });
                }}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={emailsId}>Tips and reminders by email</Label>
                <p className="text-13 text-muted-foreground">
                  A welcome, a note when your first form goes live and its first response arrives, a
                  reminder before a trial ends, and a nudge after two weeks away. Emails you need,
                  such as sign-in codes, invites and receipts, always come.
                </p>
              </div>
              <Switch
                id={emailsId}
                checked={preferences.data.productEmails}
                onCheckedChange={(productEmails) => {
                  save({ productEmails });
                }}
              />
            </div>
          </div>
        ) : preferences.isError ? (
          <p role="alert" className="text-14 text-danger-text">
            Could not load your preferences. Reload the page to try again.
          </p>
        ) : (
          <Skeleton className="h-9 w-full" aria-busy="true" aria-label="Loading preferences" />
        )}
      </CardContent>
    </Card>
  );
}

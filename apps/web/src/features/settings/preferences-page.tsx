import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseThemePreference } from '@/features/theme/theme';
import { useThemeStore } from '@/features/theme/theme-store';
import { THEME_OPTIONS } from '@/features/theme/theme-options';
import { FormDefaultsCard, MotionCard, PrivacyCard } from './account/account-preferences-cards';
import { DeleteAccountCard, PasswordCard } from './account/account-security-cards';

/** The signed-in person's own settings: look, motion, new forms, privacy, password, account. */
export function PreferencesPage() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle id="appearance-title">Appearance</CardTitle>
          <CardDescription>How Formyx looks, on every device you sign in on.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-labelledby="appearance-title"
            value={preference}
            onValueChange={(value) => {
              setPreference(parseThemePreference(value));
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Label
                key={value}
                htmlFor={`theme-${value}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-14 transition-colors duration-150 ease-standard hover:border-border-strong has-data-[state=checked]:border-accent has-data-[state=checked]:bg-accent-subtle"
              >
                <RadioGroupItem id={`theme-${value}`} value={value} />
                <Icon className="text-muted-foreground" aria-hidden />
                {label}
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
      <MotionCard />
      <FormDefaultsCard />
      <PrivacyCard />
      <PasswordCard />
      <DeleteAccountCard />
    </div>
  );
}

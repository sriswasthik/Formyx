import {
  USE_CASE_LABELS,
  USE_CASE_TEMPLATES,
  USE_CASES,
  type FormTemplateId,
  type UseCase,
} from '@formyx/shared';
import {
  BriefcaseBusiness,
  CalendarDays,
  GraduationCap,
  LoaderCircle,
  MessageSquareText,
  Shapes,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { GALLERY } from '@/features/templates/gallery';
import { TemplateThumbnail } from '@/features/templates/template-thumbnail';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

const USE_CASE_ICONS: Record<UseCase, LucideIcon> = {
  events: CalendarDays,
  feedback: MessageSquareText,
  hiring: BriefcaseBusiness,
  education: GraduationCap,
  orders: ShoppingBag,
  other: Shapes,
};

const optionClass =
  'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-150 ease-standard hover:border-border-strong has-data-[state=checked]:border-accent has-data-[state=checked]:bg-accent-subtle';

function suggestionsFor(useCase: UseCase) {
  return USE_CASE_TEMPLATES[useCase].flatMap((id) => {
    const template = GALLERY.find((candidate) => candidate.id === id);
    return template ? [template] : [];
  });
}

interface WelcomeDialogProps {
  name: string;
  initialUseCase: UseCase | null;
  /** Remembers what they will use Formyx for. */
  onUseCase: (useCase: UseCase) => void;
  /** Creates a form (and so ends the welcome). */
  onCreate: (templateId: FormTemplateId) => void;
  /** Closed without making a form. */
  onSkip: () => void;
  pending: boolean;
}

/**
 * After sign-up: what will you use Formyx for, then three templates to match. Either step can
 * be skipped; the welcome never comes back once it is closed.
 */
export function WelcomeDialog({
  name,
  initialUseCase,
  onUseCase,
  onCreate,
  onSkip,
  pending,
}: WelcomeDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [useCase, setUseCase] = useState<UseCase | null>(initialUseCase);
  const suggestions = useCase ? suggestionsFor(useCase) : [];
  const [templateId, setTemplateId] = useState<FormTemplateId | null>(null);
  const chosen = templateId ?? suggestions[0]?.id ?? 'blank';
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onSkip();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 1 && useCase) {
              onUseCase(useCase);
              setStep(2);
            } else if (step === 2) {
              onCreate(chosen);
            }
          }}
        >
          <DialogHeader>
            <p className="text-12 font-medium text-muted-foreground tabular-nums">
              Step {step} of 2
            </p>
            <DialogTitle>
              {step === 1
                ? `Welcome to Formyx${firstName ? `, ${firstName}` : ''}`
                : 'Start from a template'}
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? 'What will you use Formyx for? We’ll suggest a few templates to start from.'
                : 'Each one is ready to publish, in its own look. You can change everything.'}
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={step}
              initial={{ opacity: 0, x: step === 1 ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: step === 1 ? -8 : 8 }}
              transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
              className="mt-5"
            >
              {step === 1 ? (
                <RadioGroup
                  aria-label="What will you use Formyx for?"
                  value={useCase ?? ''}
                  onValueChange={(value) => {
                    setUseCase(USE_CASES.find((candidate) => candidate === value) ?? null);
                    setTemplateId(null);
                  }}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {USE_CASES.map((id) => {
                    const Icon = USE_CASE_ICONS[id];
                    return (
                      <Label key={id} htmlFor={`use-case-${id}`} className={optionClass}>
                        <RadioGroupItem id={`use-case-${id}`} value={id} className="mt-0.5" />
                        <Icon className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-14 font-medium">
                            {USE_CASE_LABELS[id].label}
                          </span>
                          <span className="mt-0.5 block text-13 font-normal text-muted-foreground">
                            {USE_CASE_LABELS[id].description}
                          </span>
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              ) : (
                <RadioGroup
                  aria-label="Start from"
                  value={chosen}
                  onValueChange={(value) => {
                    const match = [...suggestions, { id: 'blank' as const }].find(
                      (candidate) => candidate.id === value,
                    );
                    if (match) setTemplateId(match.id);
                  }}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {suggestions.map((template) => (
                    <Label
                      key={template.id}
                      htmlFor={`suggested-${template.id}`}
                      className={`${optionClass} flex-col p-2`}
                    >
                      {/* On phones the names say enough, and the buttons stay in view. */}
                      <span className="hidden sm:block">
                        <TemplateThumbnail template={template} className="border" />
                      </span>
                      <span className="flex items-start gap-2 px-1 pb-1">
                        <RadioGroupItem
                          id={`suggested-${template.id}`}
                          value={template.id}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-14 font-medium">{template.name}</span>
                          <span className="mt-0.5 block text-13 font-normal text-muted-foreground">
                            {template.description}
                          </span>
                        </span>
                      </span>
                    </Label>
                  ))}
                  <Label
                    htmlFor="suggested-blank"
                    className={`${optionClass} items-center sm:col-span-3`}
                  >
                    <RadioGroupItem id="suggested-blank" value="blank" />
                    <span className="text-14 font-medium">Or start from a blank form</span>
                  </Label>
                </RadioGroup>
              )}
            </m.div>
          </AnimatePresence>

          <DialogFooter className="mt-6 items-center">
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              disabled={pending}
              onClick={onSkip}
            >
              Skip for now
            </Button>
            {step === 2 && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setStep(1);
                }}
              >
                Back
              </Button>
            )}
            {step === 1 ? (
              <Button type="submit" disabled={!useCase}>
                Continue
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
                {pending ? 'Creating…' : 'Create form'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

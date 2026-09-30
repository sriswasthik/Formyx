import { formTemplateIdSchema, type FormTemplateId } from '@formyx/shared';
import { LoaderCircle } from 'lucide-react';
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
import { questionCountLabel } from './format';
import { TEMPLATE_OPTIONS } from './templates';

interface NewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (templateId: FormTemplateId) => void;
  pending: boolean;
}

export function NewFormDialog({ open, onOpenChange, onCreate, pending }: NewFormDialogProps) {
  const [templateId, setTemplateId] = useState<FormTemplateId>('blank');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Stay open while the form is being created; the page navigates away when it is.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
          <DialogDescription>
            Start from scratch or pick a template. You can change everything later.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(templateId);
          }}
        >
          <RadioGroup
            aria-label="Start from"
            value={templateId}
            onValueChange={(value) => {
              setTemplateId(formTemplateIdSchema.parse(value));
            }}
            className="gap-2"
          >
            {TEMPLATE_OPTIONS.map(({ id, name, description, icon: Icon, questionCount }) => (
              <Label
                key={id}
                htmlFor={`template-${id}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 ease-standard hover:border-border-strong has-data-[state=checked]:border-accent has-data-[state=checked]:bg-accent-subtle"
              >
                <RadioGroupItem id={`template-${id}`} value={id} className="mt-0.5" />
                <Icon className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-14 font-medium">{name}</span>
                  <span className="mt-0.5 block text-13 font-normal text-muted-foreground">
                    {description}
                  </span>
                </span>
                {id !== 'blank' && (
                  <span className="text-12 font-normal whitespace-nowrap text-muted-foreground tabular-nums">
                    {questionCountLabel(questionCount)}
                  </span>
                )}
              </Label>
            ))}
          </RadioGroup>
          <DialogFooter className="mt-6">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
              {pending ? 'Creating…' : 'Create form'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

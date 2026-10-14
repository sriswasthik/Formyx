import {
  formTemplateIdSchema,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type FormTemplateId,
  type TemplateCategory,
} from '@formyx/shared';
import { LoaderCircle, Search } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { questionCountLabel } from './format';
import { filterTemplates, TEMPLATE_OPTIONS } from './templates';

const ALL = 'all';

interface NewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (templateId: FormTemplateId) => void;
  pending: boolean;
}

export function NewFormDialog({ open, onOpenChange, onCreate, pending }: NewFormDialogProps) {
  const [templateId, setTemplateId] = useState<FormTemplateId>('blank');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const shown = filterTemplates(TEMPLATE_OPTIONS, { query, category });
  const selected = TEMPLATE_OPTIONS.find((option) => option.id === templateId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Stay open while the form is being created; the page navigates away when it is.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
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
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            aria-label="Category"
            value={category ?? ALL}
            onValueChange={(value) => {
              // Clicking the selected category again leaves it selected.
              if (!value) return;
              setCategory(TEMPLATE_CATEGORIES.find((id) => id === value) ?? null);
            }}
            className="mt-3 flex h-auto flex-wrap justify-start border-0 p-0"
          >
            <ToggleGroupItem value={ALL} className="h-8 border">
              All
            </ToggleGroupItem>
            {TEMPLATE_CATEGORIES.map((id) => (
              <ToggleGroupItem key={id} value={id} className="h-8 border">
                {TEMPLATE_CATEGORY_LABELS[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <RadioGroup
            aria-label="Start from"
            value={templateId}
            onValueChange={(value) => {
              setTemplateId(formTemplateIdSchema.parse(value));
            }}
            className="mt-3 max-h-[min(24rem,45vh)] gap-2 overflow-y-auto p-0.5"
          >
            {shown.map(({ id, name, description, icon: Icon, questionCount }) => (
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
            {shown.length === 1 && (
              <p className="py-6 text-center text-13 text-muted-foreground">
                No templates match. Try another word, or start from a blank form.
              </p>
            )}
          </RadioGroup>
          <DialogFooter className="mt-6 items-center">
            <p
              aria-live="polite"
              className="mr-auto hidden min-w-0 truncate text-13 text-muted-foreground sm:block"
            >
              {selected && selected.id !== 'blank' && `Selected: ${selected.name}`}
            </p>
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

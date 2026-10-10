import { BRAND_KIT_NAME_MAX_LENGTH, brandKitInputSchema } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

const nameSchema = brandKitInputSchema.pick({ name: true });

export interface BrandKitNameValues {
  name: string;
  /** Asked only when saving a new kit: whether new forms start with it. */
  makeDefault: boolean;
}

interface BrandKitNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  initialName: string;
  submitLabel: string;
  /** Offers "Use for new forms". */
  offerDefault?: boolean;
  busy?: boolean;
  onSubmit: (values: BrandKitNameValues) => void;
}

function NameForm({
  initialName,
  submitLabel,
  offerDefault,
  busy,
  onSubmit,
  onCancel,
}: Pick<
  BrandKitNameDialogProps,
  'initialName' | 'submitLabel' | 'offerDefault' | 'busy' | 'onSubmit'
> & {
  onCancel: () => void;
}) {
  const defaultId = useId();
  const [makeDefault, setMakeDefault] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: initialName },
  });

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(({ name }) => {
          onSubmit({ name, makeDefault });
        })(event)
      }
      className="flex flex-col gap-4"
    >
      <FormField id="brand-kit-name" label="Name" error={errors.name?.message}>
        <Input
          autoComplete="off"
          maxLength={BRAND_KIT_NAME_MAX_LENGTH}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          {...register('name')}
        />
      </FormField>
      {offerDefault && (
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={defaultId}
            checked={makeDefault}
            onCheckedChange={(checked) => {
              setMakeDefault(checked === true);
            }}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={defaultId}>Use for new forms</Label>
            <p className="text-12 text-muted-foreground">
              Forms created in this workspace start with this kit.
            </p>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Names a brand kit: saving a new one (optionally as the default) or renaming one. */
export function BrandKitNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  submitLabel,
  offerDefault = false,
  busy = false,
  onSubmit,
}: BrandKitNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <NameForm
            initialName={initialName}
            submitLabel={submitLabel}
            offerDefault={offerDefault}
            busy={busy}
            onSubmit={onSubmit}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

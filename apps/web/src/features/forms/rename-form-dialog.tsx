import { formTitleSchema, type FormSummary } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
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

const renameSchema = z.object({ title: formTitleSchema });

interface RenameFormDialogProps {
  /** The form being renamed; kept while the dialog animates out. */
  form: FormSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (form: FormSummary, title: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

function RenameForm({
  form,
  onRename,
  onCancel,
}: {
  form: FormSummary;
  onRename: (title: string) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(renameSchema),
    defaultValues: { title: form.title },
  });

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(({ title }) => {
          onRename(title);
        })(event)
      }
      className="flex flex-col gap-4"
    >
      <FormField id="rename-form-title" label="Title" error={errors.title?.message}>
        <Input
          autoComplete="off"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          {...register('title')}
        />
      </FormField>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

export function RenameFormDialog({
  form,
  open,
  onOpenChange,
  onRename,
  onCloseAutoFocus,
}: RenameFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Rename form</DialogTitle>
          <DialogDescription>Respondents see this title on the form.</DialogDescription>
        </DialogHeader>
        {form && (
          <RenameForm
            // A fresh form (and default value) for every form renamed.
            key={form.id}
            form={form}
            onCancel={() => {
              onOpenChange(false);
            }}
            onRename={(title) => {
              if (title !== form.title) onRename(form, title);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

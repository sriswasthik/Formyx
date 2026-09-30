import { findPublishIssues, type FormDetail } from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formKeys } from '@/features/forms/form-list-cache';
import { closeForm, publishForm, reopenForm } from '@/features/forms/forms-api';
import { ApiRequestError } from '@/lib/api';
import type { Autosaver } from '../autosave/autosaver';
import type { EditorStore } from '../editor-store';

export type PublishAction = 'publish' | 'close' | 'reopen';

/** How a publish attempt ended: live, stopped by what the draft still needs, or failed. */
export type PublishOutcome = 'published' | 'incomplete' | 'failed';

interface UsePublishingOptions {
  form: FormDetail;
  store: EditorStore;
  autosaver: Autosaver;
  /** The draft is not ready: the editor points out what to finish. */
  onIncomplete: () => void;
}

function failureDescription(error: unknown): string {
  if (error instanceof ApiRequestError && error.code !== 'NETWORK_ERROR' && error.status < 500) {
    return error.message;
  }
  return 'Check your connection and try again.';
}

/** Publishing, closing and reopening from the editor, keeping the forms cache in step. */
export function usePublishing({ form, store, autosaver, onIncomplete }: UsePublishingOptions) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PublishAction | null>(null);

  const apply = (next: FormDetail) => {
    queryClient.setQueryData(formKeys.detail(next.id), next);
    // Dashboards show each form's status; they refetch when next shown.
    void queryClient.invalidateQueries({ queryKey: formKeys.lists(next.workspaceId) });
  };

  const publish = async (): Promise<PublishOutcome> => {
    if (findPublishIssues(store.getState().schema).length > 0) {
      onIncomplete();
      return 'incomplete';
    }

    setPending('publish');
    try {
      // What goes live is what the server has, so the latest edits are saved first.
      if (!(await autosaver.flush())) {
        toast.error('Your latest changes are not saved yet', {
          description: 'Publishing waits until they are. Check the save status next to the title.',
        });
        return 'failed';
      }
      apply(await publishForm(form.id, store.getState().version));
      return 'published';
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'FORM_INCOMPLETE') {
        onIncomplete();
        return 'incomplete';
      }
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error('This form was changed somewhere else', {
          description: 'Load the latest version, then publish again.',
        });
      } else {
        toast.error('Could not publish the form', { description: failureDescription(error) });
      }
      return 'failed';
    } finally {
      setPending(null);
    }
  };

  const reopen = async () => {
    setPending('reopen');
    try {
      apply(await reopenForm(form.id));
      toast.success('Form reopened', { description: 'It is taking responses again.' });
    } catch (error) {
      toast.error('Could not reopen the form', { description: failureDescription(error) });
    } finally {
      setPending(null);
    }
  };

  const close = async () => {
    setPending('close');
    try {
      apply(await closeForm(form.id));
      toast.success('Form closed', {
        description: 'People who open the link see that it is closed.',
        action: { label: 'Undo', onClick: () => void reopen() },
      });
    } catch (error) {
      toast.error('Could not close the form', { description: failureDescription(error) });
    } finally {
      setPending(null);
    }
  };

  return { pending, publish, close, reopen };
}

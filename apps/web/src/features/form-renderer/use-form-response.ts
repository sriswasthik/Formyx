import {
  buildSubmissionValidator,
  evaluateVisibility,
  validateAnswers,
  type AnswerValue,
  type FormSchema,
  type SubmittedAnswers,
} from '@formyx/shared';
import { useCallback, useMemo, useState } from 'react';
import type { FileUploader, FileUploads } from './file-uploads';

/** How a handed-over submission went. Problems keep the form open to fix them. */
export type SubmitOutcome =
  | { ok: true }
  | {
      ok: false;
      /** Problems with particular answers, by field id, shown under those questions. */
      fieldErrors?: Record<string, string>;
      /** A problem with the whole submission, shown by the submit button. */
      message?: string;
    };

export type ResponseStatus = 'filling' | 'submitting' | 'done';

/** What `submit` found: sent, or problems by field id (empty for a whole-form problem). */
export type SubmitResult = { ok: true } | { ok: false; problems: Record<string, string> };

interface UseFormResponseOptions {
  schema: FormSchema;
  onSubmit?: ((answers: SubmittedAnswers) => Promise<SubmitOutcome> | SubmitOutcome) | undefined;
  uploadFile?: FileUploader | undefined;
  /** Answers to start from, such as hidden fields filled from the link. */
  initialAnswers?: Readonly<Record<string, AnswerValue>> | undefined;
}

/**
 * One respondent's answers to a form: which questions show, what is wrong with which answer,
 * files still uploading, and sending. Shared by the classic and conversational layouts.
 */
export function useFormResponse({
  schema,
  onSubmit,
  uploadFile,
  initialAnswers,
}: UseFormResponseOptions) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => ({
    ...initialAnswers,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<ResponseStatus>('filling');
  /** Questions whose file is still on its way to storage. */
  const [uploading, setUploadingIds] = useState<ReadonlySet<string>>(() => new Set());

  const visibleIds = useMemo(() => evaluateVisibility(schema, answers), [schema, answers]);

  const handleChange = useCallback((fieldId: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const { [fieldId]: _fixed, ...rest } = current;
      return rest;
    });
  }, []);

  const setUploading = useCallback((fieldId: string, busy: boolean) => {
    setUploadingIds((current) => {
      if (current.has(fieldId) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });
  }, []);

  const reportProblem = useCallback((fieldId: string, message: string) => {
    setErrors((current) => ({ ...current, [fieldId]: message }));
  }, []);

  const fileUploads = useMemo<FileUploads>(
    () => ({ upload: uploadFile ?? null, setUploading, reportProblem }),
    [uploadFile, setUploading, reportProblem],
  );

  /** Problems with the visible answers, by field id; `only` limits them to some questions. */
  const findProblems = useCallback(
    (only?: ReadonlySet<string>): Record<string, string> => {
      const problems = validateAnswers(schema, answers);
      for (const field of schema.fields) {
        if (uploading.has(field.id) && visibleIds.has(field.id)) {
          problems[field.id] = 'Wait for the file to finish uploading';
        }
      }
      if (!only) return problems;
      return Object.fromEntries(Object.entries(problems).filter(([id]) => only.has(id)));
    },
    [schema, answers, uploading, visibleIds],
  );

  /** Checks one question's answer, showing its problem if it has one. */
  const checkField = useCallback(
    (fieldId: string): string | null => {
      const problem = findProblems(new Set([fieldId]))[fieldId] ?? null;
      setErrors((current) => {
        if (problem) return { ...current, [fieldId]: problem };
        if (!(fieldId in current)) return current;
        const { [fieldId]: _fixed, ...rest } = current;
        return rest;
      });
      return problem;
    },
    [findProblems],
  );

  /** Checks several questions (a page) at once, showing their problems; returns them. */
  const checkFields = useCallback(
    (fieldIds: readonly string[]): Record<string, string> => {
      const only = new Set(fieldIds);
      const problems = findProblems(only);
      setErrors((current) => {
        const kept = Object.fromEntries(Object.entries(current).filter(([id]) => !only.has(id)));
        return { ...kept, ...problems };
      });
      return problems;
    },
    [findProblems],
  );

  /** Validates every visible answer and sends them; problems stay shown for the layout. */
  const submit = useCallback(async (): Promise<SubmitResult> => {
    const problems = findProblems();
    if (Object.keys(problems).length > 0) {
      setFormError(null);
      setErrors(problems);
      return { ok: false, problems };
    }

    setStatus('submitting');
    setFormError(null);
    try {
      const submitted = buildSubmissionValidator(schema, answers).parse(answers);
      const outcome = onSubmit ? await onSubmit(submitted) : { ok: true as const };
      if (!outcome.ok) {
        setStatus('filling');
        setFormError(outcome.message ?? null);
        const fieldErrors = outcome.fieldErrors ?? {};
        if (outcome.fieldErrors) setErrors(fieldErrors);
        return { ok: false, problems: fieldErrors };
      }
      setStatus('done');
      return { ok: true };
    } catch {
      setStatus('filling');
      setFormError('Your answers could not be sent. Check your connection and try again.');
      return { ok: false, problems: {} };
    }
  }, [findProblems, schema, answers, onSubmit]);

  /** Back to an empty form, for "Submit another response". */
  const reset = useCallback(() => {
    setAnswers({ ...initialAnswers });
    setErrors({});
    setFormError(null);
    setStatus('filling');
  }, [initialAnswers]);

  return {
    answers,
    errors,
    formError,
    status,
    visibleIds,
    fileUploads,
    handleChange,
    checkField,
    checkFields,
    submit,
    reset,
  };
}

export type FormResponse = ReturnType<typeof useFormResponse>;

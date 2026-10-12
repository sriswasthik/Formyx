import {
  buildSubmissionValidator,
  ENGLISH_LOCALE,
  type FormLocale,
  resolvePath,
  validateAnswers,
  type AnswerValue,
  type FormSchema,
  type SubmissionOutcome,
  type SubmittedAnswers,
} from '@formyx/shared';
import { useCallback, useMemo, useState } from 'react';
import type { FileUploader, FileUploads } from './file-uploads';

/** How a handed-over submission went. Problems keep the form open to fix them. */
export type SubmitOutcome =
  | {
      ok: true;
      /** Where the server says the response ended up; worked out here when it says nothing. */
      outcome?: SubmissionOutcome;
    }
  | {
      ok: false;
      /** Problems with particular answers, by field id, shown under those questions. */
      fieldErrors?: Record<string, string>;
      /** A problem with the whole submission, shown by the submit button. */
      message?: string;
    };

export type ResponseStatus = 'filling' | 'submitting' | 'done';

/**
 * The outcome worked out in the browser, for when the server does not say (the editor's
 * preview). Its module loads only then; if it cannot load, the first end screen shows.
 */
async function outcomeHere(
  schema: FormSchema,
  answers: SubmittedAnswers,
): Promise<SubmissionOutcome> {
  try {
    const { localOutcome } = await import('./local-outcome');
    return localOutcome(schema, answers);
  } catch {
    return {
      // An id no end screen has: the form shows its first.
      endScreenId: '',
      values: {},
      quiz: null,
    };
  }
}

/** What `submit` found: sent, or problems by field id (empty for a whole-form problem). */
export type SubmitResult = { ok: true } | { ok: false; problems: Record<string, string> };

interface UseFormResponseOptions {
  schema: FormSchema;
  onSubmit?: ((answers: SubmittedAnswers) => Promise<SubmitOutcome> | SubmitOutcome) | undefined;
  uploadFile?: FileUploader | undefined;
  /** Answers every response starts with, such as hidden fields filled from the link. */
  initialAnswers?: Readonly<Record<string, AnswerValue>> | undefined;
  /** Answers this response carries on from (a saved draft); not kept on reset. */
  startFrom?: Readonly<Record<string, AnswerValue>> | undefined;
  /** The form's words, for the problems shown under answers. English if not given. */
  locale?: FormLocale | undefined;
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
  startFrom,
  locale = ENGLISH_LOCALE,
}: UseFormResponseOptions) {
  const messages = locale.messages;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => ({
    ...startFrom,
    ...initialAnswers,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<ResponseStatus>('filling');
  /** Questions whose file is still on its way to storage. */
  const [uploading, setUploadingIds] = useState<ReadonlySet<string>>(() => new Set());

  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null);
  // The respondent's route through the pages, and the questions on it they see.
  const path = useMemo(() => resolvePath(schema, answers), [schema, answers]);
  const activeIds = path.active;

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
      const problems = validateAnswers(schema, answers, messages);
      for (const field of schema.fields) {
        if (uploading.has(field.id) && activeIds.has(field.id)) {
          problems[field.id] = messages.check.waitForUpload;
        }
      }
      if (!only) return problems;
      return Object.fromEntries(Object.entries(problems).filter(([id]) => only.has(id)));
    },
    [schema, answers, uploading, activeIds, messages],
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
      const submitted = buildSubmissionValidator(schema, answers, messages).parse(answers);
      const sent: SubmitOutcome = onSubmit ? await onSubmit(submitted) : { ok: true };
      if (!sent.ok) {
        setStatus('filling');
        setFormError(sent.message ?? null);
        const fieldErrors = sent.fieldErrors ?? {};
        if (sent.fieldErrors) setErrors(fieldErrors);
        return { ok: false, problems: fieldErrors };
      }
      setOutcome(sent.outcome ?? (await outcomeHere(schema, submitted)));
      setStatus('done');
      return { ok: true };
    } catch {
      setStatus('filling');
      setFormError(messages.check.sendFailed);
      return { ok: false, problems: {} };
    }
  }, [findProblems, schema, answers, onSubmit, messages]);

  /** Back to an empty form, for "Submit another response". */
  const reset = useCallback(() => {
    setAnswers({ ...initialAnswers });
    setErrors({});
    setFormError(null);
    setOutcome(null);
    setStatus('filling');
  }, [initialAnswers]);

  return {
    answers,
    errors,
    formError,
    status,
    path,
    activeIds,
    outcome,
    fileUploads,
    handleChange,
    checkField,
    checkFields,
    submit,
    reset,
  };
}

export type FormResponse = ReturnType<typeof useFormResponse>;

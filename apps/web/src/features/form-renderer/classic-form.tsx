import { splitIntoPages, type Field, type FormSchema } from '@formyx/shared';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormButton } from './form-button';
import { secondaryButton } from './styles';
import type { FormResponse } from './use-form-response';

/** How a new page arrives, as the theme's page transition says. */
const PAGE_ENTRANCES = {
  none: false,
  fade: { opacity: 0, y: 0 },
  slide: { opacity: 0, y: 6 },
} as const;

/** Fields drawn on a page; hidden fields and page breaks have nothing to show there. */
function isDrawn(field: Field): boolean {
  return field.type !== 'hidden' && field.type !== 'page_break';
}

interface ClassicFormProps {
  schema: FormSchema;
  response: FormResponse;
  /** The fields respondents can see now, in order. */
  visibleFields: readonly Field[];
  idPrefix: string;
  /** The title and description, at the top of every page. */
  header: ReactNode;
  /** Page titles sit one level below the form's title. */
  pageHeadingLevel: 'h2' | 'h3';
  numbers: ReadonlyMap<string, string>;
  pageTransition: keyof typeof PAGE_ENTRANCES;
  hiddenFields?: ReactNode;
}

/**
 * The classic layout: questions one below another, split into pages at page breaks. Next
 * checks the page's answers before moving on; sending checks them all and returns to the
 * page with the first problem.
 */
export function ClassicForm({
  schema,
  response,
  visibleFields,
  idPrefix,
  header,
  pageHeadingLevel: PageHeading,
  numbers,
  pageTransition,
  hiddenFields,
}: ClassicFormProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const { answers, errors, formError, status, handleChange, checkFields, submit } = response;
  const formRef = useRef<HTMLFormElement>(null);
  /** Where to put focus once a page has drawn: a field's control, or the page's heading. */
  const focusPending = useRef<{ fieldId: string | null } | null>(null);

  const pages = splitIntoPages(visibleFields);
  // The page is followed by its page break (so logic that adds questions before it never
  // moves the respondent), and by position when that break goes away.
  const [current, setCurrent] = useState<{ key: string | null; index: number }>({
    key: null,
    index: 0,
  });
  const byKey = pages.findIndex((page) => (page.start?.id ?? null) === current.key);
  const index = byKey === -1 ? Math.min(current.index, pages.length - 1) : byKey;
  const page = pages[index] ?? pages[0];
  const isLast = index >= pages.length - 1;
  const multiPage = pages.length > 1;
  const busy = status === 'submitting';
  const errorCount = Object.keys(errors).length;

  useLayoutEffect(() => {
    const pending = focusPending.current;
    if (!pending) return;
    focusPending.current = null;
    const field = pending.fieldId
      ? visibleFields.find((candidate) => candidate.id === pending.fieldId)
      : undefined;
    const target = field
      ? document.getElementById(fieldIds(idPrefix, field).control)
      : formRef.current?.querySelector<HTMLElement>('[data-page-start]');
    formRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  });

  const goTo = (pageIndex: number, fieldId: string | null = null) => {
    const target = pages[pageIndex];
    if (!target) return;
    setCurrent({ key: target.start?.id ?? null, index: pageIndex });
    focusPending.current = { fieldId };
  };

  const focusField = (field: Field) => {
    document.getElementById(fieldIds(idPrefix, field).control)?.focus();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !page) return;
    if (!isLast) {
      const problems = checkFields(page.fields.map((field) => field.id));
      const firstInvalid = page.fields.find((field) => field.id in problems);
      if (firstInvalid) focusField(firstInvalid);
      else goTo(index + 1);
      return;
    }
    const result = await submit();
    if (result.ok) return;
    const firstInvalid = visibleFields.find((field) => field.id in result.problems);
    if (!firstInvalid) return;
    const problemPage = pages.findIndex((candidate) => candidate.fields.includes(firstInvalid));
    if (problemPage === index || problemPage === -1) focusField(firstInvalid);
    else goTo(problemPage, firstInvalid.id);
  };

  const reveal = reduceMotion ? { duration: 0 } : { duration: DURATION.base, ease: EASE_STANDARD };
  const title = page?.start?.label.trim();
  const description = page?.start?.description?.trim();

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex scroll-mt-6 flex-col"
    >
      {header}
      {multiPage && (
        <p aria-live="polite" className="sr-only">
          {`Page ${index + 1} of ${pages.length}`}
        </p>
      )}
      <m.div
        key={page?.start?.id ?? 'first'}
        initial={index === 0 || reduceMotion ? false : PAGE_ENTRANCES[pageTransition]}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
        className="flex flex-col"
      >
        {/* Focus lands here on a new page without its own focus target. */}
        <div data-page-start tabIndex={-1} className="outline-none">
          {(title || description) && (
            <div className="flex flex-col gap-2 pb-8">
              {title && (
                <PageHeading className="form-text-lg font-semibold break-words">
                  {title}
                </PageHeading>
              )}
              {description && (
                <p className="form-text break-words whitespace-pre-wrap text-(--form-muted)">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
        <AnimatePresence initial={false}>
          {page?.fields.filter(isDrawn).map((field) => (
            <m.div
              key={field.id}
              // Clipped only while opening or closing, so focus rings show otherwise.
              initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
              animate={{
                height: 'auto',
                opacity: 1,
                transitionEnd: { overflow: 'visible' },
              }}
              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
              transition={reveal}
            >
              <div className="pb-8">
                <FieldRenderer
                  field={field}
                  mode="respondent"
                  idPrefix={idPrefix}
                  number={numbers.get(field.id)}
                  value={answers[field.id]}
                  error={errors[field.id]}
                  onChange={handleChange}
                />
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </m.div>
      {hiddenFields}
      <div className="flex flex-col items-start gap-3">
        <div className="flex w-full flex-wrap items-center gap-3">
          {index > 0 && (
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                goTo(index - 1);
              }}
            >
              <ChevronLeft aria-hidden />
              Back
            </button>
          )}
          <FormButton type="submit" busy={busy} disabled={busy}>
            {isLast ? schema.settings.submitButtonText : 'Next'}
          </FormButton>
          {multiPage && (
            <span aria-hidden className="form-text-sm text-(--form-muted) tabular-nums">
              Page {index + 1} of {pages.length}
            </span>
          )}
        </div>
        <p role="alert" className="form-text-sm text-(--form-danger) empty:hidden">
          {formError ??
            (errorCount > 0 &&
              (errorCount === 1
                ? '1 question needs your attention.'
                : `${errorCount} questions need your attention.`))}
        </p>
      </div>
    </form>
  );
}

import {
  formPages,
  pageHasContent,
  START_PAGE_KEY,
  type Field,
  type FormSchema,
  type PageLayout,
} from '@formyx/shared';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormButton } from './form-button';
import { secondaryButton } from './styles';
import { useFormMessages } from './i18n/form-locale';
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
  /** The fields as this respondent sees them: in their order, answers piped in. */
  fields: readonly Field[];
  response: FormResponse;
  idPrefix: string;
  /** The title and description, at the top of every page. */
  header: ReactNode;
  /** Page titles sit one level below the form's title. */
  pageHeadingLevel: 'h2' | 'h3';
  numbers: ReadonlyMap<string, string>;
  pageTransition: keyof typeof PAGE_ENTRANCES;
  /** A page's title and description with answers piped in. */
  pipeText: (text: string) => string;
  /** The page to start on, as when resuming. */
  initialPageKey?: string | undefined;
  onPageChange?: ((pageKey: string) => void) | undefined;
  /** Under the buttons, such as "Save and continue later". */
  actions?: ReactNode;
  hiddenFields?: ReactNode;
}

/**
 * The classic layout: questions one below another, page by page along the respondent's
 * route (page breaks divide the form; jumps skip pages). Next checks the page's answers
 * before moving on; Back retraces the route; sending checks everything and returns to the
 * page with the first problem.
 */
export function ClassicForm({
  schema,
  fields,
  response,
  idPrefix,
  header,
  pageHeadingLevel: PageHeading,
  numbers,
  pageTransition,
  pipeText,
  initialPageKey,
  onPageChange,
  actions,
  hiddenFields,
}: ClassicFormProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const messages = useFormMessages();
  const { answers, errors, formError, status, path, activeIds, handleChange, checkFields, submit } =
    response;
  const formRef = useRef<HTMLFormElement>(null);
  /** Where to put focus once a page has drawn: a field's control, or the page's start. */
  const focusPending = useRef<{ fieldId: string | null } | null>(null);

  // The pages on the route that show something, each with its fields in display order.
  const byKey = new Map(formPages(fields).map((page) => [page.key, page]));
  let route = path.pages
    .map((key) => byKey.get(key))
    .filter((page): page is PageLayout => page !== undefined)
    .filter((page) => pageHasContent(page, activeIds));
  const firstPage = byKey.get(START_PAGE_KEY);
  if (route.length === 0 && firstPage) route = [firstPage];

  // The page is followed by its key (so answering earlier questions never moves the
  // respondent), and by position when it leaves the route.
  const [current, setCurrent] = useState<{ key: string | null; index: number }>({
    key: initialPageKey ?? null,
    index: 0,
  });
  const keyed = route.findIndex((page) => page.key === current.key);
  const index = keyed === -1 ? Math.min(current.index, route.length - 1) : keyed;
  const page = route[index] ?? route[0];
  const isLast = index >= route.length - 1;
  const multiPage = route.length > 1;
  const busy = status === 'submitting';
  const errorCount = Object.keys(errors).length;

  const pageKey = page?.key;
  useEffect(() => {
    if (pageKey) onPageChange?.(pageKey);
  }, [pageKey, onPageChange]);

  useLayoutEffect(() => {
    const pending = focusPending.current;
    if (!pending) return;
    focusPending.current = null;
    const field = pending.fieldId
      ? fields.find((candidate) => candidate.id === pending.fieldId)
      : undefined;
    const target = field
      ? document.getElementById(fieldIds(idPrefix, field).control)
      : formRef.current?.querySelector<HTMLElement>('[data-page-start]');
    formRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  });

  const goTo = (pageIndex: number, fieldId: string | null = null) => {
    const target = route[pageIndex];
    if (!target) return;
    setCurrent({ key: target.key, index: pageIndex });
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
    const problemPage = route.findIndex((candidate) =>
      candidate.fields.some((field) => field.id in result.problems),
    );
    const firstInvalid = route[problemPage]?.fields.find((field) => field.id in result.problems);
    if (!firstInvalid) return;
    if (problemPage === index) focusField(firstInvalid);
    else goTo(problemPage, firstInvalid.id);
  };

  const reveal = reduceMotion ? { duration: 0 } : { duration: DURATION.base, ease: EASE_STANDARD };
  const rawTitle =
    page?.key === START_PAGE_KEY
      ? (schema.logic.pages[START_PAGE_KEY]?.title ?? '')
      : (page?.pageBreak?.label ?? '');
  const title = pipeText(rawTitle).trim();
  const description = pipeText(page?.pageBreak?.description ?? '').trim();

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
          {messages.nav.pageOf(index + 1, route.length)}
        </p>
      )}
      <m.div
        key={page?.key ?? 'first'}
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
          {page?.fields
            .filter((field) => isDrawn(field) && activeIds.has(field.id))
            .map((field) => (
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
              {messages.nav.back}
            </button>
          )}
          <FormButton type="submit" busy={busy} disabled={busy}>
            {isLast ? schema.settings.submitButtonText : messages.nav.next}
          </FormButton>
          {multiPage && (
            <span aria-hidden className="form-text-sm text-(--form-muted) tabular-nums">
              {messages.nav.pageOf(index + 1, route.length)}
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
        {actions}
      </div>
    </form>
  );
}

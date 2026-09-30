import type { FormSummary } from '@formyx/shared';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { FormActionHandler } from './form-actions-menu';
import { FormCard, FormRow, LIST_COLUMNS } from './form-card';
import type { FormsView } from './view-store';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_STANDARD } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE_STANDARD } },
};

interface FormsCollectionProps {
  forms: FormSummary[];
  view: FormsView;
  now: Date;
  canEdit: boolean;
  onAction: FormActionHandler;
}

/** Forms as a grid of cards or a list of rows. New forms fade in; removed ones fade out. */
export function FormsCollection({ forms, view, now, canEdit, onAction }: FormsCollectionProps) {
  const isGrid = view === 'grid';
  const Item = isGrid ? FormCard : FormRow;

  const list = (
    <motion.ul
      // A new key replays the entrance when switching views.
      key={view}
      aria-label="Forms"
      variants={container}
      initial="hidden"
      animate="visible"
      className={cn(isGrid ? 'grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3' : 'divide-y')}
    >
      <AnimatePresence mode="popLayout">
        {forms.map((form) => (
          <motion.li
            key={form.id}
            layout="position"
            variants={item}
            exit="exit"
            className={cn(!isGrid && 'last:rounded-b-xl')}
          >
            <Item form={form} now={now} canEdit={canEdit} onAction={onAction} />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );

  if (isGrid) return list;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        aria-hidden
        className={cn(
          LIST_COLUMNS,
          'hidden border-b bg-surface px-4 py-2 text-12 font-medium text-muted-foreground @2xl:grid',
        )}
      >
        <span>Name</span>
        <span>Status</span>
        <span>Responses</span>
        <span>Last edited</span>
        <span />
      </div>
      {list}
    </div>
  );
}

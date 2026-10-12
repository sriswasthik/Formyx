import { Megaphone, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useHasUnseenChanges } from '@/features/changelog/latest';
import { FeedbackDialog } from '@/features/feedback/feedback-dialog';

const itemClass =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-14 text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed';

/** Feedback for the team and what's new, at the foot of the sidebar. */
export function SidebarExtras({ onNavigate }: { onNavigate?: () => void }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const unseen = useHasUnseenChanges();

  return (
    <>
      <ul aria-label="Help" className="flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setFeedbackOpen(true);
            }}
          >
            <MessageSquare aria-hidden />
            Feedback
          </button>
        </li>
        <li>
          <Link to="/changelog" onClick={onNavigate} className={itemClass}>
            <Megaphone aria-hidden />
            What’s new
            {unseen && (
              <>
                <span aria-hidden className="ml-auto size-1.5 rounded-full bg-accent" />
                <span className="sr-only"> (new updates)</span>
              </>
            )}
          </Link>
        </li>
      </ul>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}

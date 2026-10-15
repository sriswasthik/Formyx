import { Megaphone, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { useHasUnseenChanges } from '@/features/changelog/latest';
import { FeedbackDialog } from '@/features/feedback/feedback-dialog';
import { HelpMenu } from '@/features/help/help-menu';
import { cn } from '@/lib/utils';
import { SidebarLink } from './sidebar-link';
import { sidebarRowClass } from './sidebar-row';

interface SidebarExtrasProps {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}

/** Feedback for the team, what's new and help, at the foot of the sidebar. */
export function SidebarExtras({ collapsed = false, onNavigate }: SidebarExtrasProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const unseen = useHasUnseenChanges();
  const { pathname } = useLocation();

  const feedback = (
    <button
      type="button"
      aria-label={collapsed ? 'Feedback' : undefined}
      className={sidebarRowClass(false, collapsed)}
      onClick={() => {
        setFeedbackOpen(true);
      }}
    >
      <MessageSquare className="shrink-0" aria-hidden />
      {!collapsed && 'Feedback'}
    </button>
  );

  const dot = unseen && (
    <>
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full bg-accent',
          collapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto',
        )}
      />
      <span className="sr-only"> (new updates)</span>
    </>
  );

  return (
    <>
      <ul aria-label="Help" className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
        <li>
          {collapsed ? (
            <ActionTooltip label="Feedback" side="right">
              {feedback}
            </ActionTooltip>
          ) : (
            feedback
          )}
        </li>
        <li>
          <SidebarLink
            to="/changelog"
            label="What’s new"
            icon={Megaphone}
            active={pathname === '/changelog'}
            collapsed={collapsed}
            onNavigate={onNavigate}
            trailing={dot}
          />
        </li>
        <li>
          <HelpMenu variant={collapsed ? 'rail' : 'sidebar'} />
        </li>
      </ul>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}

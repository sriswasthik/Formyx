import {
  PLAN_LABELS,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_PLAN,
  REFERRED_TRIAL_DAYS,
  referralSummarySchema,
  type ReferralSummary,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Mail, MessageCircle, RotateCw, Users } from 'lucide-react';
import { useRef } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { useCopy } from '@/features/forms/share/use-copy';
import { apiRequest } from '@/lib/api';

const REWARD = `${String(REFERRAL_REWARD_DAYS)} days of ${PLAN_LABELS[REFERRAL_REWARD_PLAN]}`;

function getReferrals(): Promise<ReferralSummary> {
  return apiRequest('/referrals', referralSummarySchema);
}

/** The link to share: the homepage, which notes the code for sign-up. */
function referralLink(code: string, origin: string = window.location.origin): string {
  return `${origin}/?ref=${code}`;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

function ShareLink({ link }: { link: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopy('link', () => {
    input.current?.select();
  });
  const message = `I make my forms with Formyx. Sign up with my link and get ${String(REFERRED_TRIAL_DAYS)} days of Pro free: ${link}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={input}
          readOnly
          value={link}
          aria-label="Your referral link"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          className="font-mono text-13"
        />
        <Button
          onClick={() => {
            void copy(link);
          }}
          className="shrink-0"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a
            href={`mailto:?subject=${encodeURIComponent('Try Formyx')}&body=${encodeURIComponent(message)}`}
          >
            <Mail aria-hidden />
            Email
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden />
            WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}

function Friends({ summary }: { summary: ReferralSummary }) {
  if (summary.friends.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No one has joined with your link yet"
        description="Share it with someone who makes forms: a club, a class, a team."
        className="py-10"
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {summary.friends.map((friend) => (
        <li
          key={`${friend.name}-${friend.joinedAt}`}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-14"
        >
          <span className="font-medium">{friend.name || 'A friend'}</span>
          <span className="text-13 text-muted-foreground">
            {friend.rewardedAt
              ? friend.reward === 'paused'
                ? `Paid ${dateFormat.format(new Date(friend.rewardedAt))}: your next payment is skipped`
                : `Paid ${dateFormat.format(new Date(friend.rewardedAt))}: you got ${REWARD}`
              : `Joined ${dateFormat.format(new Date(friend.joinedAt))}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** /app/settings/referrals: the person's link, how the program works, and who has joined. */
export function ReferralsPage() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ['referrals'],
    queryFn: getReferrals,
    enabled: !user.isDemo,
  });

  if (user.isDemo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Refer a friend</CardTitle>
          <CardDescription>
            The demo account has no referral link. Sign up to get one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Refer a friend</CardTitle>
          <CardDescription>
            Give a friend {REFERRED_TRIAL_DAYS} days of Pro. When they first pay for a plan, you get
            a month free.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {query.data ? (
            <ShareLink link={referralLink(query.data.code)} />
          ) : query.isError ? null : (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your link">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-8 w-48" />
            </div>
          )}
          <ol className="grid gap-3 text-14 sm:grid-cols-3">
            {[
              'Share your link with a friend.',
              `They sign up and get ${String(REFERRED_TRIAL_DAYS)} days of Pro, instead of the usual trial.`,
              `When they first pay, you get a month free: ${REWARD}, or your next payment skipped if you already pay.`,
            ].map((step, index) => (
              <li key={step} className="flex gap-3 rounded-lg border p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-12 font-medium tabular-nums">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your referrals</CardTitle>
          {query.data && (
            <CardDescription className="tabular-nums">
              {query.data.friends.length} joined · {query.data.rewardsEarned} of{' '}
              {query.data.rewardLimit} free months earned
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {query.data ? (
            <Friends summary={query.data} />
          ) : query.isError ? (
            <ErrorState
              title="Could not load your referrals"
              description="Check your connection and try again."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  <RotateCw aria-hidden />
                  Try again
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading referrals">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

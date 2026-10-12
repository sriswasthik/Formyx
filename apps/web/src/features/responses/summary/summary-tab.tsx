import type { AnalyticsRange, FormDetail } from '@formyx/shared';
import { Inbox, RotateCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '../use-responses';
import { DropOffCard } from './drop-off-card';
import { QuestionSummaryCard } from './question-summary';
import { ResponsesChart } from './responses-chart';
import { StatCards, StatCardsSkeleton } from './stat-cards';

function SummarySkeleton() {
  return (
    <div role="status" aria-label="Loading the summary" className="flex flex-col gap-6">
      <StatCardsSkeleton />
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-60 w-full" />
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="flex flex-col gap-4 p-5 sm:p-6">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  );
}

interface SummaryTabProps {
  form: FormDetail;
  onShare: () => void;
}

/** Headline numbers, responses over time and what people answered to each question. */
export function SummaryTab({ form, onShare }: SummaryTabProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const analytics = useAnalytics(form.id, range);

  if (analytics.isPending) return <SummarySkeleton />;
  if (analytics.isError) {
    return (
      <ErrorState
        title="Could not load the summary"
        description="Check your connection and try again."
        action={
          <Button disabled={analytics.isFetching} onClick={() => void analytics.refetch()}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }

  const { totals, responsesPerDay, questions, dropOff } = analytics.data;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Totals">
        <StatCards totals={totals} />
      </section>

      <ResponsesChart
        perDay={responsesPerDay}
        range={range}
        onRangeChange={setRange}
        updating={analytics.isPlaceholderData}
      />

      <DropOffCard dropOff={dropOff} />

      <section aria-labelledby="questions-heading" className="flex flex-col gap-4">
        <h2 id="questions-heading" className="text-16 font-semibold tracking-tight">
          Questions
        </h2>
        {totals.responses === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No responses yet"
            description="A summary of the answers shows up here once people respond."
            action={
              <Button onClick={onShare}>
                <Share2 aria-hidden />
                Share the form
              </Button>
            }
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {questions.map((summary, index) => (
              <QuestionSummaryCard
                key={summary.fieldId}
                summary={summary}
                index={index + 1}
                responses={totals.responses}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

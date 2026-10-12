import { formatInr } from '@formyx/shared';
import { ExternalLink, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBillingDate } from './billing-format';
import { usePayments } from './use-billing';

/** Every charge, paid or failed, newest first, with Razorpay's invoice for each paid one. */
export function PaymentsCard({ workspaceId }: { workspaceId: string }) {
  const payments = usePayments(workspaceId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading payments">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : payments.isError ? (
          <ErrorState
            title="Could not load payments"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void payments.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : payments.data.payments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payments yet"
            description="Payments for your plan show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-14">
              <caption className="sr-only">Payments</caption>
              <thead>
                <tr className="border-b text-left text-13 text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Invoice</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.data.payments.map((payment) => (
                  <tr key={payment.id} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 tabular-nums">
                      {formatBillingDate(payment.paidAt ?? payment.createdAt)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{formatInr(payment.amount)}</td>
                    <td className="py-3 pr-4">
                      {payment.status === 'paid' ? (
                        <Badge variant="success">Paid</Badge>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          <Badge variant="danger" className="w-fit">
                            Failed
                          </Badge>
                          {payment.failureReason && (
                            <span className="text-13 text-muted-foreground">
                              {payment.failureReason}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {payment.invoiceUrl && (
                        <a
                          href={payment.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm text-13 text-accent hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                          Invoice
                          <ExternalLink aria-hidden className="size-3.5" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

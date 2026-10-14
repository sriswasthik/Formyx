import { FEATURES, PLAN_LABELS, type Downgrade } from '@formyx/shared';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { changeErrorMessage } from '@/lib/api';
import { formatBillingDate } from './billing-format';
import { useDismissDowngrade } from './use-billing';

/** After a plan ended: each form that looks or works differently now, and why. */
export function DowngradeCard({
  workspaceId,
  downgrade,
}: {
  workspaceId: string;
  downgrade: Downgrade;
}) {
  const dismiss = useDismissDowngrade(workspaceId);
  const from = PLAN_LABELS[downgrade.from];
  return (
    <Card>
      <CardHeader>
        <CardTitle>What changed on Free</CardTitle>
        <CardDescription>
          Your workspace moved from {from} to Free on {formatBillingDate(downgrade.at)}. Nothing was
          deleted: forms keep taking responses, and upgrading to {from} brings everything back as it
          was.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {downgrade.forms.length === 0 ? (
          <p className="text-14 text-muted-foreground">
            None of your published forms used {from} features.
          </p>
        ) : (
          <ul aria-label="Forms that changed" className="flex flex-col divide-y rounded-lg border">
            {downgrade.forms.map((form) => (
              <li key={form.formId} className="flex flex-col gap-1 px-4 py-3">
                <Link
                  to={`/app/forms/${form.formId}/edit`}
                  className="w-fit rounded-sm text-14 font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {form.title}
                </Link>
                <span className="text-13 text-muted-foreground">
                  {form.features.map((featureId) => FEATURES[featureId].name).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={dismiss.isPending}
            onClick={() => {
              dismiss.mutate(undefined, {
                onError: (error) => {
                  toast.error('Could not hide this', { description: changeErrorMessage(error) });
                },
              });
            }}
          >
            Got it, hide this
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

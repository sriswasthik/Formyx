import { yearlySaving, type BillingInterval } from '@formyx/shared';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** Monthly or yearly prices, with what a year saves. */
export function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  // Both paid plans save the same share.
  const { percent } = yearlySaving('PRO');
  return (
    <ToggleGroup
      type="single"
      aria-label="Billing period"
      value={value}
      onValueChange={(next) => {
        if (next === 'monthly' || next === 'yearly') onChange(next);
      }}
    >
      <ToggleGroupItem value="monthly" className="px-3">
        Monthly
      </ToggleGroupItem>
      <ToggleGroupItem value="yearly" className="px-3">
        Yearly
        <Badge variant="success" className="h-4.5">
          Save {percent}%
        </Badge>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

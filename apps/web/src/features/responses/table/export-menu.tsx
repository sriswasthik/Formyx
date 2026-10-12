import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { exportResponsesUrl } from '../responses-api';

/** Downloads every response (not only those shown), as CSV or, on Pro, Excel. */
export function ExportMenu({ formId }: { formId: string }) {
  const { hasFeature } = useEntitlements();
  const excel = hasFeature('excel_export');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="w-fit">
          <Download aria-hidden />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={exportResponsesUrl(formId, 'csv')} download>
            <FileText aria-hidden />
            CSV
          </a>
        </DropdownMenuItem>
        {excel ? (
          <DropdownMenuItem asChild>
            <a href={exportResponsesUrl(formId, 'xlsx')} download>
              <FileSpreadsheet aria-hidden />
              Excel
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <FileSpreadsheet aria-hidden />
            Excel
            <ProBadge />
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

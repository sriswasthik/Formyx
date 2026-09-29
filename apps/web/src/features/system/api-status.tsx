import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealthQuery } from './use-health';

/** Live API health, fetched through the dev proxy and validated with the shared schema. */
export function ApiStatus() {
  const { data, isPending, isError } = useHealthQuery();

  if (isPending) {
    return <Skeleton className="h-5 w-20" />;
  }

  if (isError) {
    return (
      <Badge variant="danger" role="status">
        <span aria-hidden className="size-1.5 rounded-full bg-danger" />
        API offline
      </Badge>
    );
  }

  return (
    <Badge variant="success" role="status" title={`Up for ${Math.round(data.uptime)}s`}>
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      API online
    </Badge>
  );
}

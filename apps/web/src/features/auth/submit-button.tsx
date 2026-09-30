import { LoaderCircle } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';

interface SubmitButtonProps {
  pending: boolean;
  /** Label while the request is in flight, e.g. "Logging in…". */
  pendingLabel: string;
  children: React.ReactNode;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
      {pending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

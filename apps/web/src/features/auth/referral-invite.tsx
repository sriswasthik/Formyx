import { referralLookupSchema } from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { readAttribution } from '@/lib/attribution';

/** Above the sign-up form when a friend's link brought them: who invited them, and the trial. */
export function ReferralInvite() {
  const [code] = useState(() => readAttribution()?.referralCode ?? null);
  const { data } = useQuery({
    queryKey: ['referrals', 'lookup', code],
    queryFn: () =>
      apiRequest(`/public/referrals/${encodeURIComponent(code ?? '')}`, referralLookupSchema),
    enabled: code !== null,
    staleTime: Infinity,
    retry: false,
  });
  if (!data) return null;

  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border bg-accent-subtle px-3 py-2.5 text-13">
      <Gift className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <span>
        {data.referrerName ? `${data.referrerName} invited you.` : 'A friend invited you.'} Your
        account starts with <span className="tabular-nums">{data.trialDays}</span> days of Pro,
        free.
      </span>
    </p>
  );
}

import { PLAN_LABELS, REFERRAL_REWARD_DAYS, REFERRAL_REWARD_PLAN } from '@formyx/shared';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';

/** To someone whose referral just earned them a free month. */
export function renderReferralRewardEmail({
  friendName,
  reward,
  referralsUrl,
}: {
  friendName: string;
  reward: 'paused' | 'complimentary';
  referralsUrl: string;
}): RenderedEmail {
  const friend = singleLine(friendName).split(' ')[0] || 'A friend';
  const subject = 'You earned a free month of Formyx';
  const lines = [
    `${friend}, who joined through your link, has just started paying for Formyx. Thank you for sharing it.`,
    reward === 'paused'
      ? `Your next payment is skipped: your plan carries on as it is for ${String(REFERRAL_REWARD_DAYS)} days without a charge, then billing picks up again.`
      : `Your workspace has ${PLAN_LABELS[REFERRAL_REWARD_PLAN]} for the next ${String(REFERRAL_REWARD_DAYS)} days, free.`,
  ];
  const text = [
    'A free month, on us',
    '',
    ...lines.flatMap((line) => [line, '']),
    `See your referrals: ${referralsUrl}`,
    '',
    'You get this email because someone signed up with your Formyx referral link.',
  ].join('\n');
  const html = emailPage({
    subject,
    preheader: lines[0] ?? subject,
    card: `${heading('A free month, on us')}
        ${lines
          .map((line) =>
            p(
              `font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`,
              escapeHtml(line),
            ),
          )
          .join('\n        ')}
        ${button('See your referrals', referralsUrl)}`,
    footer: escapeHtml(
      'You get this email because someone signed up with your Formyx referral link.',
    ),
  });
  return { subject, html, text };
}

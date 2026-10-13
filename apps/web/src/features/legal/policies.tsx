import { GRACE_DAYS, TRIAL_DAYS } from '@formyx/shared';
import { Link } from 'react-router';
import { LegalPage, PolicyList, type LegalSection } from './legal-page';
import { SITE } from './site-config';

/*
 * The policies people agree to, and Razorpay asks a merchant's site to have. Written plainly,
 * to match what Formyx actually does. Business details come from site-config.ts.
 */

const email = (
  <a
    href={`mailto:${SITE.contactEmail}`}
    className="text-accent underline-offset-4 hover:underline"
  >
    {SITE.contactEmail}
  </a>
);

const operator = `${SITE.product} is run by ${SITE.legalName} (“we”, “us”), ${SITE.address}.`;

const TERMS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'The agreement',
    body: (
      <>
        <p>
          {operator} These terms apply when you create an account, build or publish forms, or pay
          for a plan. By using {SITE.product} you agree to them. If you use it for an organisation,
          you agree on its behalf and confirm you may.
        </p>
        <p>You must be at least 18, or have a parent or guardian agree to these terms for you.</p>
      </>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <PolicyList
        items={[
          'Give a real email address and keep your password to yourself. You are responsible for what happens under your account.',
          'Workspace owners decide who joins their workspace and what each member may do.',
          'Tell us straight away if you think someone else has used your account.',
        ]}
      />
    ),
  },
  {
    id: 'your-content',
    title: 'Your forms and responses',
    body: (
      <>
        <p>
          Your forms, and the responses people send to them, belong to you. You give us permission
          to store, process and show them only to run {SITE.product} for you: to host your forms,
          deliver responses, send the emails and integrations you set up, and keep backups.
        </p>
        <p>
          When you collect responses you are responsible for them: tell respondents what you collect
          and why, collect only what you need, and follow the laws that apply to you, including
          India’s Digital Personal Data Protection Act, 2023.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'What you may not do',
    body: (
      <>
        <p>Do not use {SITE.product} to:</p>
        <PolicyList
          items={[
            'collect passwords, card numbers, one-time codes or other credentials (phishing);',
            'impersonate a person, company or government body;',
            'send spam, or collect data for it;',
            'share anything illegal, hateful, or that harms children;',
            'break into, overload or probe our systems, or get around plan limits.',
          ]}
        />
        <p>
          We may take down a form, or suspend an account, that breaks these rules. Where we can, we
          will tell you why first.
        </p>
      </>
    ),
  },
  {
    id: 'plans',
    title: 'Plans, trials and payments',
    body: (
      <>
        <p>
          {SITE.product} has a free plan and paid plans, priced in Indian rupees on the{' '}
          <Link to="/pricing" className="text-accent underline-offset-4 hover:underline">
            pricing page
          </Link>
          . New accounts get a {TRIAL_DAYS}-day trial of Pro without a card.
        </p>
        <PolicyList
          items={[
            'Paid plans renew automatically each month or year until cancelled. Payments are taken by Razorpay, which emails a receipt for each one.',
            `If a payment fails, your plan keeps working for ${String(GRACE_DAYS)} days while it is retried; after that the workspace moves to the free plan. Nothing is deleted.`,
            'We may change prices. Changes apply from your next renewal, and we will email you at least 30 days before.',
            'Cancelling and refunds are covered by our refund and cancellation policy.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'service',
    title: 'The service',
    body: (
      <>
        <p>
          We work to keep {SITE.product} available and your data safe, with daily backups. But we
          provide it “as is”: we do not promise it will never be interrupted or free of errors. We
          may change or remove features; if we remove one you pay for, we will tell you first.
        </p>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, and
          our total liability for any claim is limited to what you paid us in the 12 months before
          it.
        </p>
      </>
    ),
  },
  {
    id: 'ending',
    title: 'Ending the agreement',
    body: (
      <p>
        You can delete your account at any time from Account settings, which deletes the workspaces
        only you belong to and their forms and responses. Export anything you want to keep first. We
        may end the agreement if you seriously or repeatedly break these terms.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Law and disputes',
    body: (
      <p>
        These terms are governed by the laws of India. Disputes go to the courts of {SITE.courts}.
        We will always try to sort things out with you directly first: write to {email}.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        If we change these terms in a way that matters, we will email account owners at least 14
        days before the change takes effect. The date at the top shows the latest version.
      </p>
    ),
  },
];

const PRIVACY: LegalSection[] = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <p>
        {operator} This policy explains what we collect when you use {SITE.product}, and why. When
        you collect responses with a form, you decide what is asked: for those responses we act on
        your behalf, and your own privacy notice applies to your respondents.
      </p>
    ),
  },
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <PolicyList
        items={[
          <>
            <strong className="font-medium text-foreground">Your account:</strong> your name, email
            address, a hashed password, and your preferences.
          </>,
          <>
            <strong className="font-medium text-foreground">Your work:</strong> the forms you build,
            their designs, settings and uploads, and the workspaces you belong to.
          </>,
          <>
            <strong className="font-medium text-foreground">Responses:</strong> the answers
            respondents send, with the time, how long they took, and their browser and the page they
            came from.
          </>,
          <>
            <strong className="font-medium text-foreground">Payments:</strong> your plan and the
            status of payments. Card and UPI details go to Razorpay and never reach us.
          </>,
          <>
            <strong className="font-medium text-foreground">Usage:</strong> a few events about which
            features are used, sent under a code that cannot be traced back to you, with no IP
            address or location. You can turn this off in Preferences.
          </>,
          <>
            <strong className="font-medium text-foreground">Errors:</strong> technical details when
            something breaks, with personal details removed before they are sent.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'use',
    title: 'How we use it',
    body: (
      <PolicyList
        items={[
          'To run Formyx: host your forms, deliver responses, and send the notifications and integrations you set up.',
          'To send emails about your account: security, billing, and a few to help you get started, each with a way to stop them.',
          'To fix problems, prevent abuse, and decide what to build next.',
        ]}
      />
    ),
  },
  {
    id: 'share',
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We never sell your data or your respondents’ data. We share it only with the services that
          help us run {SITE.product}, each bound to protect it:
        </p>
        <PolicyList
          items={[
            'Hosting and databases: Vercel, and Render and Neon, whose servers are in the European Union.',
            'Uploads: Cloudinary. Emails: Resend. Payments: Razorpay.',
            'Error reports: Sentry. Usage events: PostHog (EU), without personal details.',
            'Integrations you connect yourself, such as Google Sheets, Notion, Slack or Discord, receive the responses you send them.',
          ]}
        />
        <p>We will also share data when the law requires it.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and storage',
    body: (
      <p>
        We use one cookie, to keep you signed in, for up to seven days. Your browser also keeps a
        few settings, such as light or dark mode, and answers to a form you have not finished yet.
        There are no advertising or tracking cookies.
      </p>
    ),
  },
  {
    id: 'keep',
    title: 'How long we keep it',
    body: (
      <p>
        We keep your account and forms until you delete them or your account. Workspaces can delete
        responses automatically after a period they choose. Backups are kept for 30 days, then
        deleted. Payment records are kept as long as tax law requires.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>
          You can see, correct, export and delete your data: most of it from the app itself, and
          anything else by writing to {email}. You can withdraw consent to optional emails or usage
          events at any time. If you are a respondent to someone’s form, contact its owner; we will
          help them answer you.
        </p>
        <p>
          If you are unhappy with how we handled your data, write to us first. You may also complain
          to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Data travels over HTTPS and is stored encrypted. Passwords are hashed, and secrets such as
        integration tokens are encrypted again. Access is limited to the people who run{' '}
        {SITE.product}. If a breach affects you, we will tell you without delay.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy in a way that matters, we will email account owners before it takes
        effect. The date at the top shows the latest version.
      </p>
    ),
  },
];

const REFUNDS: LegalSection[] = [
  {
    id: 'trial',
    title: 'Free trial',
    body: (
      <p>
        Every new account gets {TRIAL_DAYS} days of Pro without a card. Nothing is charged during or
        after the trial unless you choose a plan.
      </p>
    ),
  },
  {
    id: 'cancel',
    title: 'Cancelling',
    body: (
      <>
        <p>
          You can cancel a paid plan at any time from your workspace’s billing settings. Your plan
          keeps working to the end of the month or year you paid for, and is not renewed after that.
          You can resume it any time before then.
        </p>
        <p>When a plan ends, the workspace moves to the free plan. Nothing is deleted.</p>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'Refunds',
    body: (
      <PolicyList
        items={[
          `If you are not happy, write to us within ${String(SITE.refundWindowDays)} days of the first payment for a plan and we will refund it in full.`,
          'If you were charged twice, or charged after cancelling, we refund the extra payment in full, whenever you tell us.',
          'Otherwise, payments are not refunded for the part of a month or year that is left after you cancel.',
        ]}
      />
    ),
  },
  {
    id: 'how',
    title: 'How refunds are paid',
    body: (
      <p>
        To ask for a refund, write to {email} from the email address on your account, naming the
        workspace. We reply within {SITE.replyWithin}. Approved refunds are made through Razorpay to
        the card, UPI account or other method you paid with, and usually arrive within 5 to 7
        working days, depending on your bank.
      </p>
    ),
  },
];

const SHIPPING: LegalSection[] = [
  {
    id: 'delivery',
    title: 'How plans are delivered',
    body: (
      <p>
        {SITE.product} is software used online: nothing is shipped. A paid plan starts as soon as
        Razorpay confirms the payment, usually within a minute, and its features are available in
        your workspace straight away: its billing settings show the new plan, and Razorpay emails
        you a receipt.
      </p>
    ),
  },
  {
    id: 'problems',
    title: 'If a plan has not started',
    body: (
      <p>
        If you have paid but your workspace still shows the old plan after 30 minutes, write to{' '}
        {email} with the payment’s reference from your receipt. We will start the plan or refund the
        payment.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={<p>The rules for using {SITE.product}, in plain words.</p>}
      sections={TERMS}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={<p>What we collect, why, who sees it, and how to ask for it to be deleted.</p>}
      sections={PRIVACY}
    />
  );
}

export function RefundsPage() {
  return (
    <LegalPage
      title="Refund and cancellation policy"
      intro={<p>How cancelling works, and when we give your money back.</p>}
      sections={REFUNDS}
    />
  );
}

export function ShippingPage() {
  return (
    <LegalPage
      title="Shipping and delivery policy"
      intro={<p>How a plan you buy reaches you.</p>}
      sections={SHIPPING}
    />
  );
}

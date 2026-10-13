import { choice, field, form, when, type FormTemplate } from './builders.js';

function volunteerSignup() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      choice(
        'multi_choice',
        ['Teaching children', 'Food drives', 'Tree planting', 'Fundraising', 'Social media'],
        { label: 'How would you like to help?', required: true },
      ),
      choice('multi_choice', ['Weekday mornings', 'Weekday evenings', 'Weekends'], {
        label: 'When are you free?',
        required: true,
      }),
      field('long_text', { label: 'Any skills or experience you would like to share?' }),
      field('consent', { label: 'I agree to follow the volunteer code of conduct' }),
    ],
    { submit: 'Sign me up', thanks: 'Thank you for volunteering! Our coordinator will call you.' },
  );
}

function membershipApplication() {
  const type = choice('single_choice', ['Individual', 'Student', 'Family'], {
    label: 'Membership type',
    required: true,
  });
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('phone', { label: 'Phone number' }),
      type,
      field('short_text', {
        label: 'College or school',
        required: true,
        conditions: when(type, 'Student'),
      }),
      field('number', {
        label: 'Number of family members',
        validation: { min: 2, max: 8 },
        conditions: when(type, 'Family'),
      }),
      choice('multi_choice', ['Events', 'Newsletter', 'Volunteering', 'Committees'], {
        label: 'What are you interested in?',
      }),
      field('consent', { label: 'I agree to the club rules' }),
    ],
    {
      submit: 'Apply for membership',
      thanks: 'Welcome! We will email your membership details soon.',
    },
  );
}

function donationPledge() {
  const frequency = choice('single_choice', ['Once', 'Every month'], {
    label: 'How often would you like to give?',
    required: true,
  });
  const receipt = field('yes_no', { label: 'Would you like an 80G tax receipt?' });
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('currency', { label: 'Amount', required: true }),
      frequency,
      choice('single_choice', ['Where it is needed most', 'Education', 'Health', 'Environment'], {
        label: 'What should your gift support?',
      }),
      receipt,
      field('short_text', {
        label: 'PAN, for the receipt',
        description: 'Needed for an 80G receipt.',
        required: true,
        conditions: [{ sourceFieldId: receipt.id, operator: 'equals', value: 'yes' }],
      }),
      field('statement', {
        label: 'We will send payment details by email. Thank you for your generosity.',
        conditions: when(frequency, 'Once'),
      }),
    ],
    { submit: 'Pledge', thanks: 'Thank you for your pledge! Payment details are on their way.' },
  );
}

export const COMMUNITY_TEMPLATES: FormTemplate[] = [
  {
    id: 'volunteer_signup',
    slug: 'volunteer-signup',
    name: 'Volunteer sign-up',
    description: 'Volunteers share how they can help and when they are free.',
    seoDescription:
      'A volunteer sign-up form for NGOs and community groups: areas of interest, availability, skills and a code of conduct agreement.',
    category: 'community',
    presetId: 'botanical',
    defaultTitle: 'Volunteer sign-up',
    build: volunteerSignup,
  },
  {
    id: 'membership_application',
    slug: 'membership-application',
    name: 'Membership application',
    description: 'Individuals, students and families join your club or society.',
    seoDescription:
      'A membership application form for clubs and societies, with follow-up questions for students and families and agreement to the rules.',
    category: 'community',
    presetId: 'sunrise-mesh',
    defaultTitle: 'Membership application',
    build: membershipApplication,
  },
  {
    id: 'donation_pledge',
    slug: 'donation-pledge',
    name: 'Donation pledge',
    description: 'Supporters pledge an amount, how often, and what it supports.',
    seoDescription:
      'A donation pledge form for non-profits: amount, one-off or monthly, the cause it supports, and details for an 80G tax receipt.',
    category: 'community',
    presetId: 'pastel-blobs',
    defaultTitle: 'Donation pledge',
    build: donationPledge,
  },
];

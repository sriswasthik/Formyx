import { choice, field, form, optionId, when, type FormTemplate } from './builders.js';

function eventRegistration() {
  const diet = choice('dropdown', ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Other'], {
    label: 'Dietary requirements',
    placeholder: 'Select one',
  });
  return form(
    [
      field('short_text', { label: 'Full name', required: true, placeholder: 'Ada Lovelace' }),
      field('email', {
        label: 'Email',
        description: 'We will send your ticket here.',
        required: true,
        placeholder: 'you@example.com',
      }),
      field('phone', {
        label: 'Phone number',
        description: 'Only used if we need to reach you on the day.',
      }),
      choice(
        'multi_choice',
        [
          'Opening keynote',
          'Design systems workshop',
          'Building for accessibility',
          'Evening networking',
        ],
        { label: 'Which sessions will you attend?', required: true },
      ),
      diet,
      field('long_text', {
        label: 'Tell us about your dietary needs',
        placeholder: 'Allergies, intolerances or preferences',
        conditions: [
          { sourceFieldId: diet.id, operator: 'equals', value: optionId(diet, 'Other') },
        ],
      }),
      field('number', {
        label: 'How many guests are you bringing?',
        description: 'Up to 5 per registration.',
        placeholder: '0',
        validation: { min: 0, max: 5 },
      }),
      choice('single_choice', ['Newsletter', 'Social media', 'A friend or colleague', 'Other'], {
        label: 'How did you hear about the event?',
      }),
      field('statement', {
        label:
          "That's everything. We'll email your ticket and the full schedule a week before the event.",
      }),
    ],
    {
      submit: 'Register',
      thanks: "You're registered! Check your inbox for a confirmation email.",
    },
  );
}

function rsvp() {
  const coming = field('yes_no', { label: 'Can you make it?', required: true });
  const yes = { sourceFieldId: coming.id, operator: 'equals' as const, value: 'yes' };
  return form(
    [
      field('short_text', { label: 'Your name', required: true }),
      coming,
      field('number', {
        label: 'How many of you are coming, including you?',
        required: true,
        placeholder: '1',
        validation: { min: 1, max: 6 },
        conditions: [yes],
      }),
      field('long_text', {
        label: 'Any food allergies we should know about?',
        conditions: [yes],
      }),
      field('long_text', { label: 'A note for the hosts', placeholder: 'Optional' }),
    ],
    { submit: 'Send RSVP', thanks: 'Thanks for letting us know. See you there!' },
  );
}

function weddingRsvp() {
  const attending = choice('single_choice', ['Joyfully accepts', 'Regretfully declines'], {
    label: 'Will you join us?',
    required: true,
  });
  const accepts = when(attending, 'Joyfully accepts');
  return form(
    [
      field('short_text', { label: 'Your full name', required: true }),
      field('email', { label: 'Email', required: true }),
      attending,
      choice('multi_choice', ['Haldi', 'Mehendi', 'Wedding ceremony', 'Reception'], {
        label: 'Which celebrations will you attend?',
        required: true,
        conditions: accepts,
      }),
      field('number', {
        label: 'Number of guests, including you',
        required: true,
        validation: { min: 1, max: 4 },
        conditions: accepts,
      }),
      choice('single_choice', ['Vegetarian', 'Non-vegetarian', 'Jain', 'Vegan'], {
        label: 'Meal preference',
        conditions: accepts,
      }),
      field('long_text', { label: 'Your wishes for the couple' }),
    ],
    { submit: 'Send RSVP', thanks: 'Thank you! Your RSVP means the world to us.' },
  );
}

function workshopSignup() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      choice('single_choice', ['Saturday morning', 'Saturday afternoon', 'Sunday morning'], {
        label: 'Which session would you like?',
        required: true,
      }),
      choice('single_choice', ['Beginner', 'Some experience', 'Confident'], {
        label: 'How would you describe your experience?',
        required: true,
      }),
      field('long_text', {
        label: 'What do you hope to take away from the workshop?',
        placeholder: 'A sentence or two is plenty',
      }),
      field('yes_no', { label: 'Will you bring your own laptop?' }),
      field('consent', {
        label: 'I understand seats are limited and I will cancel if I cannot come',
      }),
    ],
    { submit: 'Save my seat', thanks: "You're in! We'll email you the details and what to bring." },
  );
}

function webinarRegistration() {
  return form(
    [
      field('short_text', { label: 'Name', required: true }),
      field('email', {
        label: 'Work email',
        description: 'The joining link and the recording go here.',
        required: true,
      }),
      field('short_text', { label: 'Company' }),
      choice('dropdown', ['Founder', 'Product', 'Design', 'Engineering', 'Marketing', 'Other'], {
        label: 'Your role',
      }),
      field('long_text', {
        label: 'Any questions for the speakers?',
        description: 'We will try to answer them live.',
      }),
    ],
    {
      submit: 'Register for the webinar',
      thanks: "You're registered. The joining link is on its way to your inbox.",
    },
  );
}

function speakerApplication() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('url', { label: 'Website or LinkedIn profile' }),
      field('short_text', { label: 'Talk title', required: true }),
      field('long_text', {
        label: 'Abstract',
        description: 'What will people learn? 150 words or fewer.',
        required: true,
      }),
      choice(
        'single_choice',
        ['Talk (25 minutes)', 'Lightning talk (5 minutes)', 'Workshop (90 minutes)'],
        {
          label: 'Format',
          required: true,
        },
      ),
      choice('single_choice', ['Beginner', 'Intermediate', 'Advanced'], {
        label: 'Audience level',
      }),
      field('yes_no', { label: 'Have you spoken at an event before?' }),
      field('url', { label: 'Link to a previous talk', placeholder: 'Optional' }),
    ],
    {
      submit: 'Submit proposal',
      thanks: 'Thanks for your proposal! The programme committee will reply within three weeks.',
    },
  );
}

export const EVENT_TEMPLATES: FormTemplate[] = [
  {
    id: 'event_registration',
    slug: 'event-registration',
    name: 'Event registration',
    description: 'Collect attendee details, session choices and dietary needs.',
    seoDescription:
      'A free event registration form template: attendee details, session choices, dietary needs and guests, ready to publish and share in minutes.',
    category: 'events',
    presetId: 'blueprint',
    defaultTitle: 'Event registration',
    build: eventRegistration,
  },
  {
    id: 'rsvp',
    slug: 'party-rsvp',
    name: 'Party RSVP',
    description: 'Find out who is coming, how many, and any allergies.',
    seoDescription:
      'A simple party RSVP form: who is coming, how many guests and food allergies, with follow-up questions only for people who say yes.',
    category: 'events',
    presetId: 'confetti-party',
    defaultTitle: 'RSVP',
    build: rsvp,
  },
  {
    id: 'wedding_rsvp',
    slug: 'wedding-rsvp',
    name: 'Wedding RSVP',
    description: 'Guests choose the celebrations they will attend, with meal preferences.',
    seoDescription:
      'A wedding RSVP form template for Indian weddings and beyond: which celebrations guests will attend, number of guests, meal preferences and wishes.',
    category: 'events',
    presetId: 'editorial',
    defaultTitle: 'Wedding RSVP',
    build: weddingRsvp,
  },
  {
    id: 'workshop_signup',
    slug: 'workshop-signup',
    name: 'Workshop sign-up',
    description: 'Let people pick a session and tell you their experience level.',
    seoDescription:
      'A workshop sign-up form: choose a session, share experience level and goals, and agree to cancel if plans change. Free to customise.',
    category: 'events',
    presetId: 'paper',
    defaultTitle: 'Workshop sign-up',
    build: workshopSignup,
  },
  {
    id: 'webinar_registration',
    slug: 'webinar-registration',
    name: 'Webinar registration',
    description: 'Register attendees and collect questions for the speakers.',
    seoDescription:
      'A webinar registration form that collects names, work emails, roles and questions for the speakers, so the joining link reaches the right people.',
    category: 'events',
    presetId: 'minimal',
    defaultTitle: 'Webinar registration',
    build: webinarRegistration,
  },
  {
    id: 'speaker_application',
    slug: 'call-for-speakers',
    name: 'Call for speakers',
    description: 'Collect talk proposals with abstracts, formats and links.',
    seoDescription:
      'A call for speakers form for conferences and meetups: talk title, abstract, format, audience level and links to previous talks.',
    category: 'events',
    presetId: 'midnight',
    defaultTitle: 'Call for speakers',
    build: speakerApplication,
  },
];

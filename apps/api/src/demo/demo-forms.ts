import {
  createDefaultSettings,
  createDefaultTheme,
  createField,
  createOption,
  FORM_SCHEMA_VERSION,
  FORM_TEMPLATES,
  migrateTheme,
  THEME_PRESETS,
  type Answers,
  type ChoiceFieldType,
  type FieldOfType,
  type FieldType,
  type FormSchema,
  type FormTemplateId,
  type FormTheme,
  type ThemePresetId,
} from '@formyx/shared';
import type { Random } from './random.js';
import { fictionalPhone, type Person, type ReferrerMix } from './respondents.js';

/** One of the demo workspace's forms, and how people respond to it. */
export interface DemoForm {
  title: string;
  theme: FormTheme;
  schema: FormSchema;
  createdDaysAgo: number;
  /** Also when it was last edited. */
  publishedDaysAgo: number;
  responses: number;
  /** Share of visitors who send a response, for the views to go with them. */
  completionRate: number;
  /** How many responses arrive `daysAgo` days ago relative to other days (0 is today). */
  dayWeight: (daysAgo: number) => number;
  /** Typical time to fill the form in, in seconds. */
  medianSeconds: number;
  referrers: ReferrerMix;
  answer: (random: Random, person: Person, submittedAt: Date) => Answers;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The demo shows free looks only, so it publishes under any plan. */
function presetTheme(id: ThemePresetId): FormTheme {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset.theme;
}

function templateSchema(id: FormTemplateId): FormSchema {
  const template = FORM_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Template "${id}" does not exist`);
  return template.build();
}

/** Looks up the questions answers are generated for, by label, so ids can stay random. */
function questions(schema: FormSchema) {
  function field(label: string) {
    const found = schema.fields.find((candidate) => candidate.label === label);
    if (!found) throw new Error(`Demo question "${label}" does not exist`);
    return found;
  }

  return {
    id: (label: string) => field(label).id,
    option(label: string, optionLabel: string): string {
      const found = field(label);
      const option =
        'options' in found
          ? found.options.find((candidate) => candidate.label === optionLabel)
          : undefined;
      if (!option) throw new Error(`Demo option "${optionLabel}" of "${label}" does not exist`);
      return option.id;
    },
  };
}

/** Each option chosen independently with its own likelihood; at least one is always chosen. */
function pickSome(random: Random, entries: readonly (readonly [string, number])[]): string[] {
  const chosen = entries.filter(([, likelihood]) => random.chance(likelihood)).map(([id]) => id);
  return chosen.length > 0 ? chosen : [random.weighted(entries)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const LIKED = [
  'Building a form takes minutes, not an afternoon.',
  'The drag and drop editor feels fast and predictable.',
  'Conditional logic is easy to set up without reading the docs.',
  'Watching responses arrive live during our launch was great.',
  'Clean design. Our forms finally look like our brand.',
  'The summary charts save me a spreadsheet every week.',
  'CSV export works straight away with our reporting.',
  "It's calm. No clutter and no upsell banners everywhere.",
  'Templates got us started quickly.',
  'Respondents tell us the forms are easy to fill in on their phones.',
  'Undo and redo. I break things a lot.',
  'Webhooks into our CRM saved us a separate automation tool.',
  'Sharing a link or embedding a form is one click.',
  'Support answered within an hour.',
  'Forms load quickly, even on a bad connection.',
  'The preview shows exactly what people will see.',
];

const TO_IMPROVE = [
  "I'd love more question types, like a matrix or a ranking question.",
  'Let us save our own templates for the whole team.',
  'The analytics could show where people drop off.',
  'Pricing for small nonprofits is a bit steep.',
  'Taking payments inside a form would be a big help.',
  'More control over email notifications, like a daily digest.',
  'Partial responses would help us follow up with people who leave halfway.',
  'A Slack integration that does not need webhooks.',
  'Sometimes I lose track of which version is published.',
  'Logic across many questions gets hard to read.',
  'Make it easier to translate a form into other languages.',
  'File uploads should allow bigger videos.',
];

const productFeedback = (): DemoForm => {
  const schema = templateSchema('feedback_survey');
  schema.description =
    'Two minutes of your time helps us decide what to build next. Thank you for helping!';
  const q = questions(schema);
  const satisfaction = q.id('Overall, how satisfied are you with our product?');
  const features = 'Which features do you use most?';
  const followUp = 'May we follow up with you about your feedback?';

  return {
    title: 'Product feedback',
    theme: createDefaultTheme(),
    schema,
    createdDaysAgo: 41,
    publishedDaysAgo: 3,
    responses: 72,
    completionRate: 0.62,
    // Steady, a little busier lately, with a spike when the survey went out in a newsletter.
    dayWeight: (daysAgo) => (0.8 + (0.4 * (29 - daysAgo)) / 29) * (daysAgo === 9 ? 3.5 : 1),
    medianSeconds: 75,
    referrers: [
      [null, 45],
      ['https://mail.google.com/', 25],
      ['https://outlook.live.com/', 12],
      ['https://www.linkedin.com/', 8],
      ['https://t.co/', 10],
    ],
    answer(random, person) {
      const rating = random.weighted([
        [1, 3],
        [2, 7],
        [3, 17],
        [4, 40],
        [5, 33],
      ]);
      const wantsFollowUp = random.chance(rating <= 2 ? 0.6 : 0.3);
      const answers: Record<string, Answers[string]> = {
        [satisfaction]: rating,
        [q.id('How likely are you to recommend us to a friend or colleague?')]: clamp(
          Math.round(rating * 2 - 0.5 + random.normal() * 1.1),
          1,
          10,
        ),
        [q.id(followUp)]: q.option(followUp, wantsFollowUp ? 'Yes' : 'No'),
      };
      if (random.chance(0.55)) answers[q.id('What do you like most?')] = random.pick(LIKED);
      if (rating < 4 && random.chance(0.85)) {
        answers[q.id('What could we do better?')] = random.pick(TO_IMPROVE);
      }
      if (random.chance(0.8)) {
        answers[q.id(features)] = pickSome(random, [
          [q.option(features, 'Form builder'), 0.8],
          [q.option(features, 'Conditional logic'), 0.5],
          [q.option(features, 'Analytics'), 0.45],
          [q.option(features, 'Integrations'), 0.25],
        ]);
      }
      if (wantsFollowUp) answers[q.id('Your email')] = person.email;
      return answers;
    },
  };
};

const DIETARY_NEEDS = [
  'Severe nut allergy, so please label dishes.',
  'No pork, please.',
  'Lactose intolerant.',
  'Pescatarian.',
  'Low FODMAP if possible.',
  'Coeliac, so strictly gluten-free.',
];

const eventRegistration = (): DemoForm => {
  const schema = templateSchema('event_registration');
  schema.description =
    'A day of talks and workshops about building and running design systems. 14 November, London. Free to attend; places are limited.';
  const q = questions(schema);
  const sessions = 'Which sessions will you attend?';
  const diet = 'Dietary requirements';
  const heardFrom = 'How did you hear about the event?';

  return {
    title: 'Design Systems Day registration',
    // The Paper preset: off-white with a fine grain, a serif and teal.
    theme: presetTheme('paper'),
    schema,
    createdDaysAgo: 36,
    publishedDaysAgo: 12,
    responses: 50,
    completionRate: 0.48,
    // Registrations pick up as the day gets closer, with a spike when the speakers were announced.
    dayWeight: (daysAgo) => (0.35 + (1.3 * (29 - daysAgo)) / 29) * (daysAgo === 18 ? 3 : 1),
    medianSeconds: 110,
    referrers: [
      [null, 30],
      ['https://www.linkedin.com/', 25],
      ['https://mail.google.com/', 18],
      ['https://www.meetup.com/', 15],
      ['https://t.co/', 12],
    ],
    answer(random, person) {
      const dietChoice = random.weighted([
        ['None', 55],
        ['Vegetarian', 18],
        ['Vegan', 8],
        ['Gluten-free', 7],
        ['Other', 5],
        [null, 7],
      ]);
      const answers: Record<string, Answers[string]> = {
        [q.id('Full name')]: person.name,
        [q.id('Email')]: person.email,
        [q.id(sessions)]: pickSome(random, [
          [q.option(sessions, 'Opening keynote'), 0.85],
          [q.option(sessions, 'Design systems workshop'), 0.55],
          [q.option(sessions, 'Building for accessibility'), 0.5],
          [q.option(sessions, 'Evening networking'), 0.6],
        ]),
      };
      if (random.chance(0.45)) answers[q.id('Phone number')] = fictionalPhone(random);
      if (dietChoice) answers[q.id(diet)] = q.option(diet, dietChoice);
      if (dietChoice === 'Other') {
        answers[q.id('Tell us about your dietary needs')] = random.pick(DIETARY_NEEDS);
      }
      const guests = random.weighted([
        [0, 55],
        [1, 30],
        [2, 10],
        [3, 3],
        [null, 2],
      ]);
      if (guests !== null) answers[q.id('How many guests are you bringing?')] = guests;
      const source = random.weighted([
        ['Newsletter', 30],
        ['Social media', 30],
        ['A friend or colleague', 28],
        ['Other', 7],
        [null, 5],
      ]);
      if (source) answers[q.id(heardFrom)] = q.option(heardFrom, source);
      return answers;
    },
  };
};

type FieldProps<T extends FieldType> = Partial<Omit<FieldOfType<T>, 'id' | 'type'>>;

function field<T extends FieldType>(type: T, props: FieldProps<T>): FieldOfType<T> {
  return { ...createField(type), ...props };
}

function choice<T extends ChoiceFieldType>(
  type: T,
  labels: string[],
  props: FieldProps<T>,
): FieldOfType<T> {
  return { ...createField(type), options: labels.map(createOption), ...props };
}

function buildJobApplication(): FormSchema {
  const designSystem = choice('single_choice', ['Yes', 'No'], {
    label: 'Have you worked on a design system?',
    required: true,
  });
  const yes = designSystem.options.find((option) => option.label === 'Yes');
  if (!yes) throw new Error('The design system question needs a "Yes" option');

  return {
    version: FORM_SCHEMA_VERSION,
    description:
      "We're hiring a product designer to join our small team, remote-friendly within Europe. It takes about ten minutes, and we read every application.",
    fields: [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true, placeholder: 'you@example.com' }),
      field('short_text', {
        label: 'Current or most recent role',
        required: true,
        placeholder: 'Product designer at …',
      }),
      field('number', {
        label: 'Years of design experience',
        required: true,
        validation: { min: 0, max: 50 },
      }),
      choice(
        'single_choice',
        ['Interaction design', 'Visual design', 'Design systems', 'User research'],
        { label: 'Where are you strongest?', required: true },
      ),
      field('long_text', {
        label: "Tell us about a project you're proud of",
        description: 'What was the problem, what did you do and what changed?',
        required: true,
      }),
      designSystem,
      field('long_text', {
        label: 'What was your part in it?',
        conditions: [{ sourceFieldId: designSystem.id, operator: 'equals', value: yes.id }],
      }),
      choice('dropdown', ['Remote', 'Hybrid', 'In the office'], {
        label: 'How would you like to work?',
        required: true,
        placeholder: 'Select one',
      }),
      field('date', { label: 'When could you start?' }),
    ],
    settings: {
      ...createDefaultSettings(),
      submitButtonText: 'Send application',
      successMessage:
        'Thanks for applying. We read every application and will reply within two weeks.',
    },
  };
}

const ROLES = [
  'Product designer at a fintech startup',
  'Senior UX designer at a healthcare company',
  'Freelance product designer',
  'UI designer at a design agency',
  'Design lead at an online retailer',
  'UX researcher moving into design',
  'Product designer at a travel app',
  'Interaction designer on a public sector service',
  'Graphic designer moving into product',
  'Designer at a B2B software company',
  'Junior product designer at a media company',
  'Design systems designer at a bank',
];

const PROJECTS = [
  'I redesigned onboarding for a budgeting app. Drop-off in the first week fell from 46% to 29% after we cut setup from nine steps to four and let people connect their bank later.',
  'I led the move of three product teams onto one component library. We shipped 40 documented components, and building a new screen now takes about half the time.',
  'At a hospital I worked on outpatient booking. We tested with patients over 70 and rewrote every error message; calls to the booking line dropped by a fifth.',
  'I designed a returns flow for an online shop that needed no printer, just a parcel locker. Returns-related support tickets went down 35%.',
  'For a public service I made the application form accessible and written in plain English. It passed an external WCAG 2.2 AA audit with no serious issues.',
  'I built the first dark mode for our design system, including a token structure the engineers generate code from. We found 200 hard-coded colours along the way.',
  'I ran research with 12 small business owners and turned it into a simpler invoicing flow. Time to send a first invoice went from 11 minutes to under 4.',
  'I designed a check-in app for a festival with 30,000 visitors. It had to work offline at the gates, so we designed every state for a missing connection first.',
  'I reworked search for a travel booking site. Better filters and clearer empty states raised bookings that start from search by 12%.',
  'I created a forms pattern library at an insurer, from validation to error summaries. Completion of the quote form went up 18%.',
  "I prototyped and tested a hands-free mode for a recipe app. We didn't ship it, but what we learned changed how the step-by-step view works.",
  'As the only designer at a startup I took the product from sketches to launch in five months, and set up the research and design reviews the team still uses.',
];

const DESIGN_SYSTEM_PARTS = [
  'I maintained the component library and ran the weekly office hours.',
  'I wrote the contribution guidelines and reviewed every new component for accessibility.',
  'I set up our design tokens and the pipeline that publishes them to code.',
  'One of two designers on it: I owned forms, tables and the documentation site.',
  'I contributed patterns from my product team and helped migrate old screens.',
  'I led the audit that found 14 different buttons, and the plan to get to one.',
];

const jobApplication = (): DemoForm => {
  const schema = buildJobApplication();
  const q = questions(schema);
  const strongest = 'Where are you strongest?';
  const designSystem = 'Have you worked on a design system?';
  const workStyle = 'How would you like to work?';

  return {
    title: 'Product designer application',
    theme: migrateTheme({
      accentColor: '#61728B',
      font: 'inter',
      radius: 'sharp',
      background: 'white',
    }),
    schema,
    createdDaysAgo: 26,
    publishedDaysAgo: 24,
    responses: 28,
    completionRate: 0.31,
    // Posted 24 days ago: busiest in the first week, then tailing off.
    dayWeight: (daysAgo) => (daysAgo > 23 ? 0 : 0.4 + 1.4 * Math.exp(-(23 - daysAgo) / 6)),
    medianSeconds: 420,
    referrers: [
      [null, 25],
      ['https://www.linkedin.com/', 40],
      ['https://www.google.com/', 15],
      ['https://news.ycombinator.com/', 10],
      ['https://dribbble.com/', 10],
    ],
    answer(random, person, submittedAt) {
      const years = clamp(Math.round(2 + Math.abs(random.normal()) * 5 + random.next() * 2), 1, 25);
      const hasDesignSystem = random.chance(years >= 4 ? 0.65 : 0.3);
      const answers: Record<string, Answers[string]> = {
        [q.id('Full name')]: person.name,
        [q.id('Email')]: person.email,
        [q.id('Current or most recent role')]: random.pick(ROLES),
        [q.id('Years of design experience')]: years,
        [q.id(strongest)]: q.option(
          strongest,
          random.weighted([
            ['Interaction design', 40],
            ['Visual design', 22],
            ['Design systems', 20],
            ['User research', 18],
          ]),
        ),
        [q.id("Tell us about a project you're proud of")]: random.pick(PROJECTS),
        [q.id(designSystem)]: q.option(designSystem, hasDesignSystem ? 'Yes' : 'No'),
        [q.id(workStyle)]: q.option(
          workStyle,
          random.weighted([
            ['Remote', 50],
            ['Hybrid', 40],
            ['In the office', 10],
          ]),
        ),
      };
      if (hasDesignSystem && random.chance(0.9)) {
        answers[q.id('What was your part in it?')] = random.pick(DESIGN_SYSTEM_PARTS);
      }
      if (random.chance(0.85)) {
        const start = new Date(submittedAt.getTime() + random.int(14, 90) * DAY_MS);
        answers[q.id('When could you start?')] = isoDate(start);
      }
      return answers;
    },
  };
};

/** The demo workspace's forms, newest edit first. Fresh ids on every call. */
export function demoForms(): DemoForm[] {
  return [productFeedback(), eventRegistration(), jobApplication()];
}

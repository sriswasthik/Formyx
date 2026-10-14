import { choice, field, form, options, when, type FormTemplate } from './builders.js';

function jobApplication() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      choice('dropdown', ['Product designer', 'Frontend engineer', 'Customer success lead'], {
        label: 'Which role are you applying for?',
        required: true,
      }),
      field('number', {
        label: 'Years of relevant experience',
        validation: { min: 0, max: 50 },
      }),
      field('url', { label: 'Portfolio, GitHub or LinkedIn' }),
      field('file', {
        label: 'Your CV',
        description: 'PDF or Word, up to 10 MB.',
        required: true,
        fileConfig: { maxSizeMb: 10, allowedTypes: ['pdf', 'document'] },
      }),
      field('long_text', { label: 'Why do you want to join us?', required: true }),
      field('date', { label: 'Earliest start date' }),
      field('consent', {
        label: 'I agree that my details may be kept for this role and similar ones for 12 months',
      }),
    ],
    {
      submit: 'Send application',
      thanks: 'Thank you for applying! We reply to every application within two weeks.',
    },
  );
}

function internshipApplication() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('short_text', { label: 'College or university', required: true }),
      choice('dropdown', ['First year', 'Second year', 'Third year', 'Final year', 'Graduated'], {
        label: 'Year of study',
        required: true,
      }),
      choice('multi_choice', ['Design', 'Engineering', 'Marketing', 'Operations'], {
        label: 'Teams you are interested in',
        required: true,
      }),
      field('date_range', { label: 'When are you available?' }),
      field('long_text', { label: 'Tell us about a project you are proud of' }),
      field('file', {
        label: 'Your CV',
        fileConfig: { maxSizeMb: 10, allowedTypes: ['pdf', 'document'] },
      }),
    ],
    { submit: 'Apply', thanks: 'Thanks for applying! We will be in touch soon.' },
  );
}

function employeeOnboarding() {
  return form(
    [
      field('short_text', { label: 'Full name (as on official documents)', required: true }),
      field('email', { label: 'Personal email', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      field('date', { label: 'Date of birth', required: true }),
      field('address', { label: 'Home address', required: true }),
      field('short_text', { label: 'Emergency contact name', required: true }),
      field('phone', { label: 'Emergency contact phone', required: true }),
      choice('dropdown', ['XS', 'S', 'M', 'L', 'XL', 'XXL'], { label: 'T-shirt size' }),
      choice('single_choice', ['Mac', 'Windows', 'Linux'], { label: 'Preferred laptop' }),
      field('signature', {
        label: 'Signature',
        description: 'Confirms the details above are correct.',
        required: true,
      }),
    ],
    { submit: 'Submit details', thanks: 'Welcome aboard! HR will confirm your details shortly.' },
  );
}

function leaveRequest() {
  const type = choice(
    'single_choice',
    ['Annual leave', 'Sick leave', 'Parental leave', 'Unpaid leave', 'Other'],
    { label: 'Type of leave', required: true },
  );
  return form(
    [
      field('short_text', { label: 'Your name', required: true }),
      field('email', { label: 'Work email', required: true }),
      type,
      field('short_text', { label: 'What kind of leave?', conditions: when(type, 'Other') }),
      field('date_range', { label: 'Dates', required: true }),
      field('short_text', { label: 'Who will cover for you?' }),
      field('long_text', { label: 'Anything your manager should know?' }),
    ],
    { submit: 'Request leave', thanks: 'Your request has been sent to your manager.' },
  );
}

function exitInterview() {
  return form(
    [
      field('short_text', { label: 'Your name', placeholder: 'Optional' }),
      choice(
        'multi_choice',
        ['Career growth', 'Pay', 'Manager', 'Work-life balance', 'Relocation', 'Other'],
        { label: 'What were the main reasons for leaving?', required: true },
      ),
      field('opinion_scale', {
        label: 'I would recommend working here to a friend.',
        lowLabel: 'Strongly disagree',
        highLabel: 'Strongly agree',
      }),
      field('long_text', { label: 'What did we do well?' }),
      field('long_text', { label: 'What should we change?' }),
      field('yes_no', { label: 'Would you consider coming back one day?' }),
    ],
    {
      submit: 'Submit',
      thanks: 'Thank you for your honesty, and all the best for what comes next.',
    },
  );
}

function employeeEngagement() {
  return form(
    [
      field('matrix', {
        label: 'How much do you agree with each statement?',
        rows: options([
          'I know what is expected of me at work',
          'I have the tools I need to do my job well',
          'My work is recognised',
          'I see myself here in two years',
        ]),
        columns: options(['Disagree', 'Neutral', 'Agree']),
        required: true,
      }),
      field('nps', {
        label: 'How likely are you to recommend this company as a place to work?',
        required: true,
      }),
      field('long_text', { label: 'What is one thing we should start doing?' }),
      field('long_text', { label: 'What is one thing we should stop doing?' }),
      field('statement', { label: 'This survey is anonymous: we never ask who you are.' }),
    ],
    { submit: 'Submit', thanks: 'Thank you! Results are shared with the whole team.' },
  );
}

export const HR_TEMPLATES: FormTemplate[] = [
  {
    id: 'job_application',
    slug: 'job-application',
    name: 'Job application',
    description: 'Collect CVs, portfolios and motivation for open roles.',
    seoDescription:
      'A job application form template: contact details, role, experience, portfolio links, CV upload and consent, ready for your careers page.',
    category: 'hr',
    presetId: 'minimal',
    defaultTitle: 'Job application',
    build: jobApplication,
  },
  {
    id: 'internship_application',
    slug: 'internship-application',
    name: 'Internship application',
    description: 'Students apply with their college, interests and availability.',
    seoDescription:
      'An internship application form for students: college, year of study, teams of interest, availability dates, a proud project and CV.',
    category: 'hr',
    presetId: 'blueprint',
    defaultTitle: 'Internship application',
    build: internshipApplication,
  },
  {
    id: 'employee_onboarding',
    slug: 'employee-onboarding',
    name: 'Employee onboarding',
    description: 'New joiners share personal details, emergency contacts and a signature.',
    seoDescription:
      'An employee onboarding form: personal details, address, emergency contacts, equipment preferences and an e-signature, all in one place.',
    category: 'hr',
    presetId: 'paper',
    defaultTitle: 'New joiner details',
    build: employeeOnboarding,
  },
  {
    id: 'leave_request',
    slug: 'leave-request',
    name: 'Leave request',
    description: 'Employees request leave with dates, type and cover.',
    seoDescription:
      'A leave request form for teams: type of leave, dates, who will cover and notes for the manager. Replace emails and spreadsheets.',
    category: 'hr',
    presetId: 'minimal-mono',
    defaultTitle: 'Leave request',
    build: leaveRequest,
  },
  {
    id: 'exit_interview',
    slug: 'exit-interview',
    name: 'Exit interview',
    description: 'Learn why people leave and what to change.',
    seoDescription:
      'An exit interview survey: reasons for leaving, what went well, what to change and whether people would return, with an optional name.',
    category: 'hr',
    presetId: 'midnight',
    defaultTitle: 'Exit interview',
    build: exitInterview,
  },
  {
    id: 'employee_engagement',
    slug: 'employee-engagement-survey',
    name: 'Employee engagement survey',
    description: 'An anonymous pulse on clarity, tools, recognition and loyalty.',
    seoDescription:
      'An anonymous employee engagement survey: agreement grid, employee NPS, and what to start and stop doing. Run it every quarter.',
    category: 'hr',
    presetId: 'studio',
    defaultTitle: 'Employee engagement survey',
    build: employeeEngagement,
  },
];

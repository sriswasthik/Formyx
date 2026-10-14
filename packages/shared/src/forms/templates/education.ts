import { choice, field, form, options, when, type FormTemplate } from './builders.js';

function admissionEnquiry() {
  const programme = choice(
    'dropdown',
    ['B.Tech', 'BBA', 'B.Com', 'B.Sc', 'BA', 'MBA', 'M.Tech', 'Other'],
    { label: 'Programme you are interested in', required: true, placeholder: 'Select one' },
  );
  return form(
    [
      field('short_text', { label: "Student's full name", required: true }),
      field('email', { label: 'Email', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      programme,
      field('short_text', { label: 'Which programme?', conditions: when(programme, 'Other') }),
      choice('single_choice', ['Class 12 (appearing)', 'Class 12 (passed)', 'Graduate'], {
        label: 'Current qualification',
        required: true,
      }),
      field('number', {
        label: 'Percentage in your last exam',
        validation: { min: 0, max: 100 },
      }),
      field('short_text', { label: 'City', required: true }),
      choice('multi_choice', ['Hostel', 'Scholarships', 'Transport', 'Placements'], {
        label: 'What would you like to know more about?',
      }),
      choice('single_choice', ['Phone call', 'WhatsApp', 'Email'], {
        label: 'How should our admissions team contact you?',
        required: true,
      }),
    ],
    {
      submit: 'Send enquiry',
      thanks: 'Thank you! Our admissions team will get in touch within two working days.',
    },
  );
}

function courseRegistration() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('short_text', { label: 'Student ID', required: true }),
      choice(
        'multi_choice',
        ['Data structures', 'Operating systems', 'Machine learning', 'Product design', 'Economics'],
        { label: 'Courses for this term', description: 'Choose up to three.', required: true },
      ),
      choice('single_choice', ['Morning', 'Afternoon', 'Evening'], {
        label: 'Preferred batch',
      }),
      field('long_text', { label: 'Any accessibility needs we should plan for?' }),
    ],
    { submit: 'Register', thanks: 'You are registered. Your timetable will be emailed to you.' },
  );
}

function courseEvaluation() {
  return form(
    [
      field('short_text', { label: 'Course name', required: true }),
      field('matrix', {
        label: 'Rate the course',
        rows: options(['Content', 'Teaching', 'Pace', 'Assignments', 'Resources']),
        columns: options(['Poor', 'Fair', 'Good', 'Very good', 'Excellent']),
        required: true,
      }),
      field('slider', {
        label: 'How many hours a week did you spend on this course?',
        min: 0,
        max: 20,
        step: 1,
        unit: 'hours',
      }),
      field('long_text', { label: 'What helped you learn the most?' }),
      field('long_text', { label: 'What would you change?' }),
    ],
    { submit: 'Submit evaluation', thanks: 'Thank you! Your answers stay anonymous.' },
  );
}

function scholarshipApplication() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('email', { label: 'Email', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      field('short_text', { label: 'Institution', required: true }),
      field('currency', {
        label: 'Annual family income',
        description: 'Used only to assess eligibility.',
        required: true,
      }),
      field('number', { label: 'Percentage in your last exam', validation: { min: 0, max: 100 } }),
      field('long_text', {
        label: 'Why are you applying, and how will it help you?',
        description: '300 words or fewer.',
        required: true,
      }),
      field('file', {
        label: 'Latest mark sheet',
        required: true,
        fileConfig: { maxSizeMb: 10, allowedTypes: ['pdf', 'image'] },
      }),
      field('consent', { label: 'I confirm that the information above is true' }),
    ],
    {
      submit: 'Submit application',
      thanks: 'Your application is in. Results are announced on our website.',
    },
  );
}

function parentTeacherMeeting() {
  return form(
    [
      field('short_text', { label: "Parent or guardian's name", required: true }),
      field('short_text', { label: "Student's name", required: true }),
      choice('dropdown', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'], {
        label: 'Class',
        required: true,
      }),
      choice(
        'single_choice',
        ['10:00 – 10:15', '10:15 – 10:30', '10:30 – 10:45', '10:45 – 11:00'],
        {
          label: 'Preferred slot',
          required: true,
        },
      ),
      choice('single_choice', ['In person', 'Video call'], {
        label: 'How would you like to meet?',
      }),
      field('long_text', { label: 'Anything you would like to discuss?' }),
    ],
    { submit: 'Book a slot', thanks: 'Thank you! The school will confirm your slot.' },
  );
}

export const EDUCATION_TEMPLATES: FormTemplate[] = [
  {
    id: 'college_admission_enquiry',
    slug: 'college-admission-enquiry',
    name: 'College admission enquiry',
    description: 'Prospective students ask about programmes, hostels and scholarships.',
    seoDescription:
      'A college admission enquiry form for Indian colleges: programme, qualification, marks, city and how the admissions team should get in touch.',
    category: 'education',
    presetId: 'blueprint',
    defaultTitle: 'Admission enquiry',
    build: admissionEnquiry,
  },
  {
    id: 'course_registration',
    slug: 'course-registration',
    name: 'Course registration',
    description: 'Students choose their courses and batch for the term.',
    seoDescription:
      'A course registration form for colleges and coaching centres: student ID, courses for the term, preferred batch and accessibility needs.',
    category: 'education',
    presetId: 'minimal',
    defaultTitle: 'Course registration',
    build: courseRegistration,
  },
  {
    id: 'course_evaluation',
    slug: 'course-evaluation',
    name: 'Course evaluation',
    description: 'Anonymous ratings of content, teaching and pace.',
    seoDescription:
      'An anonymous course evaluation form: a rating grid for content, teaching and pace, weekly hours, and what helped students learn.',
    category: 'education',
    presetId: 'paper',
    defaultTitle: 'Course evaluation',
    build: courseEvaluation,
  },
  {
    id: 'scholarship_application',
    slug: 'scholarship-application',
    name: 'Scholarship application',
    description: 'Collect eligibility details, an essay and mark sheets.',
    seoDescription:
      'A scholarship application form: student details, family income, marks, a short essay and a mark sheet upload, with a declaration.',
    category: 'education',
    presetId: 'editorial',
    defaultTitle: 'Scholarship application',
    build: scholarshipApplication,
  },
  {
    id: 'parent_teacher_meeting',
    slug: 'parent-teacher-meeting',
    name: 'Parent–teacher meeting',
    description: 'Parents book a slot and say what they would like to discuss.',
    seoDescription:
      'A parent-teacher meeting booking form for schools: class, preferred time slot, in person or video, and topics to discuss.',
    category: 'education',
    presetId: 'pastel-blobs',
    defaultTitle: 'Parent–teacher meeting',
    build: parentTeacherMeeting,
  },
];

import type { Field } from '../fields.js';
import { choice, field, form, optionId, type FormTemplate } from './builders.js';

interface Question {
  label: string;
  options: string[];
  answer: string;
  points?: number;
}

/** A marked quiz: one choice question per entry, and the right answers kept on the server. */
function quiz(
  questions: Question[],
  { passPercent, thanks, intro }: { passPercent: number; thanks: string; intro: string },
) {
  const built = questions.map((question) => ({
    question,
    asked: choice('single_choice', question.options, { label: question.label, required: true }),
  }));
  const fields: Field[] = [
    field('short_text', { label: 'Your name', required: true }),
    field('statement', { label: intro }),
    ...built.map(({ asked }) => asked),
  ];
  return form(fields, {
    submit: 'Submit answers',
    thanks,
    logic: (logic) => ({
      ...logic,
      quiz: {
        enabled: true,
        answers: Object.fromEntries(
          built.map(({ question, asked }) => [
            asked.id,
            { correct: [optionId(asked, question.answer)], points: question.points ?? 1 },
          ]),
        ),
        passPercent,
        showScore: true,
        revealAnswers: true,
      },
    }),
  });
}

const generalKnowledge = () =>
  quiz(
    [
      {
        label: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
        answer: 'Mars',
      },
      {
        label: 'Who wrote "Gitanjali"?',
        options: ['Rabindranath Tagore', 'R. K. Narayan', 'Premchand', 'Kalidasa'],
        answer: 'Rabindranath Tagore',
      },
      {
        label: 'What is the capital of Australia?',
        options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'],
        answer: 'Canberra',
      },
      {
        label: 'How many bones are in the adult human body?',
        options: ['186', '206', '226', '246'],
        answer: '206',
      },
      {
        label: 'Which gas do plants take in from the air?',
        options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
        answer: 'Carbon dioxide',
      },
    ],
    {
      passPercent: 60,
      intro: 'Five questions, one point each. You need 3 to pass.',
      thanks: 'Thanks for playing! Your score is below.',
    },
  );

const safetyTraining = () =>
  quiz(
    [
      {
        label: 'What is the first thing to do when the fire alarm sounds?',
        options: [
          'Finish your work',
          'Leave by the nearest safe exit',
          'Use the lift',
          'Collect your belongings',
        ],
        answer: 'Leave by the nearest safe exit',
        points: 2,
      },
      {
        label: 'Where is the assembly point?',
        options: ['The car park', 'The reception', 'The canteen', 'The roof'],
        answer: 'The car park',
      },
      {
        label: 'Which extinguisher is safe for electrical fires?',
        options: ['Water', 'Foam', 'CO₂', 'Wet chemical'],
        answer: 'CO₂',
        points: 2,
      },
      {
        label: 'Who should you report a near miss to?',
        options: ['Nobody', 'Your safety officer', 'A friend', 'Social media'],
        answer: 'Your safety officer',
      },
    ],
    {
      passPercent: 80,
      intro: 'Answer every question; you need 80% to complete the training.',
      thanks: 'Thank you for completing the training quiz.',
    },
  );

export const QUIZ_TEMPLATES: FormTemplate[] = [
  {
    id: 'general_knowledge_quiz',
    slug: 'general-knowledge-quiz',
    name: 'General knowledge quiz',
    description: 'A marked quiz with a score and the right answers at the end.',
    seoDescription:
      'A general knowledge quiz template with automatic marking, a pass mark and the right answers shown after submitting. Make your own in minutes.',
    category: 'quizzes',
    presetId: 'confetti-party',
    defaultTitle: 'General knowledge quiz',
    build: generalKnowledge,
  },
  {
    id: 'safety_training_quiz',
    slug: 'safety-training-quiz',
    name: 'Safety training quiz',
    description: 'Check that staff understood fire and safety training.',
    seoDescription:
      'A workplace safety training quiz: fire drills, extinguishers and reporting, with weighted questions and an 80% pass mark.',
    category: 'quizzes',
    presetId: 'midnight',
    defaultTitle: 'Safety training quiz',
    build: safetyTraining,
  },
];

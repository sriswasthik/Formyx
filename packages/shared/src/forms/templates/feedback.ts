import { choice, field, form, options, when, type FormTemplate } from './builders.js';

function feedbackSurvey() {
  const satisfaction = field('rating', {
    label: 'Overall, how satisfied are you with our product?',
    required: true,
    ratingScale: 5,
    // Numbers, as the template has always had (new rating questions start as stars).
    ratingStyle: 'numbers',
  });
  const followUp = choice('single_choice', ['Yes', 'No'], {
    label: 'May we follow up with you about your feedback?',
    required: true,
  });
  return form(
    [
      satisfaction,
      field('rating', {
        label: 'How likely are you to recommend us to a friend or colleague?',
        description: '1 is not at all likely, 10 is extremely likely.',
        required: true,
        ratingScale: 10,
        ratingStyle: 'numbers',
      }),
      field('long_text', { label: 'What do you like most?' }),
      field('long_text', {
        label: 'What could we do better?',
        description: 'The more specific, the better.',
        conditions: [{ sourceFieldId: satisfaction.id, operator: 'less_than', value: 4 }],
      }),
      choice('multi_choice', ['Form builder', 'Conditional logic', 'Analytics', 'Integrations'], {
        label: 'Which features do you use most?',
      }),
      followUp,
      field('email', {
        label: 'Your email',
        required: true,
        placeholder: 'you@example.com',
        conditions: when(followUp, 'Yes'),
      }),
    ],
    {
      submit: 'Send feedback',
      thanks: 'Thank you! Your feedback helps us build a better product.',
    },
  );
}

function npsSurvey() {
  const score = field('nps', {
    label: 'How likely are you to recommend us to a friend or colleague?',
    required: true,
  });
  return form(
    [
      score,
      field('long_text', {
        label: 'What is the main reason for your score?',
        required: true,
      }),
      field('long_text', {
        label: 'What one thing would make you more likely to recommend us?',
        conditions: [{ sourceFieldId: score.id, operator: 'less_than', value: 9 }],
      }),
    ],
    { submit: 'Send', thanks: 'Thank you, that helps more than you know.' },
  );
}

function customerSatisfaction() {
  return form(
    [
      field('rating', {
        label: 'How satisfied are you with your recent experience?',
        required: true,
      }),
      field('matrix', {
        label: 'How did we do on each of these?',
        rows: options([
          'Speed of response',
          'Friendliness',
          'Solving your problem',
          'Value for money',
        ]),
        columns: options(['Poor', 'Fair', 'Good', 'Excellent']),
      }),
      field('opinion_scale', {
        label: 'It was easy to get what I needed.',
        lowLabel: 'Strongly disagree',
        highLabel: 'Strongly agree',
      }),
      field('long_text', { label: 'Anything else you would like to tell us?' }),
      field('email', {
        label: 'Email, if you would like a reply',
        placeholder: 'Optional',
      }),
    ],
    { submit: 'Send feedback', thanks: 'Thank you for taking the time to tell us.' },
  );
}

function eventFeedback() {
  return form(
    [
      field('rating', { label: 'How would you rate the event overall?', required: true }),
      choice('multi_choice', ['Talks', 'Workshops', 'Networking', 'Venue', 'Food'], {
        label: 'What did you enjoy most?',
      }),
      field('ranking', {
        label: 'Rank what matters most to you at events like this',
        options: options(['Speakers', 'Meeting people', 'Hands-on sessions', 'Price']),
      }),
      field('long_text', { label: 'What should we change next time?' }),
      field('yes_no', { label: 'Would you come again?', required: true }),
    ],
    { submit: 'Send feedback', thanks: 'Thank you for coming, and for helping us improve.' },
  );
}

function websiteFeedback() {
  const found = field('yes_no', {
    label: 'Did you find what you were looking for?',
    required: true,
  });
  return form(
    [
      choice(
        'single_choice',
        ['Learning about the product', 'Comparing prices', 'Getting support', 'Something else'],
        { label: 'What brought you here today?', required: true },
      ),
      found,
      field('long_text', {
        label: 'What were you looking for?',
        conditions: [{ sourceFieldId: found.id, operator: 'equals', value: 'no' }],
      }),
      field('opinion_scale', {
        label: 'How easy was the site to use?',
        lowLabel: 'Very hard',
        highLabel: 'Very easy',
      }),
      field('long_text', { label: 'Any other suggestions?' }),
    ],
    { submit: 'Send', thanks: 'Thanks! We read every response.' },
  );
}

function restaurantFeedback() {
  return form(
    [
      choice('single_choice', ['Dine-in', 'Takeaway', 'Delivery'], {
        label: 'How did you order?',
        required: true,
      }),
      field('rating', { label: 'Food', required: true }),
      field('rating', { label: 'Service', required: true }),
      field('rating', { label: 'Value for money' }),
      field('short_text', { label: 'Your favourite dish today' }),
      field('long_text', { label: 'Anything we could do better?' }),
      field('phone', { label: 'Phone, for an exclusive offer on your next visit' }),
    ],
    { submit: 'Send feedback', thanks: 'Thank you! We hope to see you again soon.' },
  );
}

export const FEEDBACK_TEMPLATES: FormTemplate[] = [
  {
    id: 'feedback_survey',
    slug: 'product-feedback-survey',
    name: 'Feedback survey',
    description: 'Measure satisfaction and learn what to improve, with smart follow-ups.',
    seoDescription:
      'A product feedback survey template with satisfaction and recommendation ratings, and follow-up questions that appear only when they are needed.',
    category: 'feedback',
    presetId: 'minimal',
    defaultTitle: 'Feedback survey',
    build: feedbackSurvey,
  },
  {
    id: 'nps_survey',
    slug: 'nps-survey',
    name: 'NPS survey',
    description: 'The Net Promoter Score question, and why people gave their score.',
    seoDescription:
      'A Net Promoter Score (NPS) survey: the 0 to 10 recommendation question, the reason behind each score, and a follow-up for passives and detractors.',
    category: 'feedback',
    presetId: 'minimal-mono',
    defaultTitle: 'NPS survey',
    build: npsSurvey,
  },
  {
    id: 'customer_satisfaction',
    slug: 'customer-satisfaction-survey',
    name: 'Customer satisfaction (CSAT)',
    description: 'Rate a recent experience, and each part of it.',
    seoDescription:
      'A customer satisfaction (CSAT) survey template: an overall rating, a grid for speed, friendliness and value, and space for comments.',
    category: 'feedback',
    presetId: 'sea-glass',
    defaultTitle: 'Customer satisfaction survey',
    build: customerSatisfaction,
  },
  {
    id: 'event_feedback',
    slug: 'event-feedback',
    name: 'Event feedback',
    description: 'Learn what attendees enjoyed and what to change next time.',
    seoDescription:
      'An event feedback form for conferences, meetups and workshops: overall rating, highlights, priorities ranked, and what to change next time.',
    category: 'feedback',
    presetId: 'paper',
    defaultTitle: 'Event feedback',
    build: eventFeedback,
  },
  {
    id: 'website_feedback',
    slug: 'website-feedback',
    name: 'Website feedback',
    description: 'Ask visitors what they came for and whether they found it.',
    seoDescription:
      'A website feedback form that asks visitors why they came, whether they found it, and how easy your site was to use.',
    category: 'feedback',
    presetId: 'blueprint',
    defaultTitle: 'Website feedback',
    build: websiteFeedback,
  },
  {
    id: 'restaurant_feedback',
    slug: 'restaurant-feedback',
    name: 'Restaurant feedback',
    description: 'Ratings for food, service and value, and a favourite dish.',
    seoDescription:
      'A restaurant feedback form for dine-in, takeaway and delivery customers: food, service and value ratings, favourite dishes and suggestions.',
    category: 'feedback',
    presetId: 'botanical',
    defaultTitle: 'Restaurant feedback',
    build: restaurantFeedback,
  },
];

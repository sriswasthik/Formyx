import { choice, field, form, when, type FormTemplate } from './builders.js';

function orderForm() {
  const delivery = choice('single_choice', ['Delivery', 'Pick up from the shop'], {
    label: 'How would you like to receive your order?',
    required: true,
  });
  return form(
    [
      field('short_text', { label: 'Name', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      choice(
        'multi_choice',
        ['Classic tote bag (₹499)', 'Block-print cushion cover (₹799)', 'Handmade notebook (₹349)'],
        { label: 'What would you like to order?', required: true },
      ),
      field('number', {
        label: 'Quantity of each',
        required: true,
        validation: { min: 1, max: 20 },
      }),
      delivery,
      field('address', {
        label: 'Delivery address',
        required: true,
        conditions: when(delivery, 'Delivery'),
      }),
      choice('single_choice', ['UPI', 'Cash on delivery'], { label: 'Payment', required: true }),
      field('long_text', { label: 'Anything we should know?', placeholder: 'Gift note, colours…' }),
    ],
    { submit: 'Place order', thanks: 'Thank you for your order! We will confirm it on WhatsApp.' },
  );
}

function cateringOrder() {
  return form(
    [
      field('short_text', { label: 'Name', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      field('date', { label: 'Event date', required: true }),
      field('time', { label: 'Serving time', required: true }),
      field('number', { label: 'Number of guests', required: true, validation: { min: 10 } }),
      choice('single_choice', ['Vegetarian', 'Non-vegetarian', 'Both'], {
        label: 'Menu',
        required: true,
      }),
      choice('multi_choice', ['Starters', 'Main course', 'Desserts', 'Live counter'], {
        label: 'What should we serve?',
      }),
      field('address', { label: 'Venue address', required: true }),
      field('currency', { label: 'Budget per person' }),
    ],
    { submit: 'Request a quote', thanks: 'Thanks! We will send a menu and quote within a day.' },
  );
}

function quoteRequest() {
  return form(
    [
      field('short_text', { label: 'Name', required: true }),
      field('email', { label: 'Work email', required: true }),
      field('short_text', { label: 'Company' }),
      choice('multi_choice', ['Website', 'Mobile app', 'Branding', 'Marketing'], {
        label: 'What do you need?',
        required: true,
      }),
      choice('single_choice', ['Under ₹1 lakh', '₹1–5 lakh', '₹5–20 lakh', 'More than ₹20 lakh'], {
        label: 'Budget',
        required: true,
      }),
      field('date', { label: 'When do you need it by?' }),
      field('long_text', { label: 'Tell us about the project', required: true }),
    ],
    { submit: 'Request a quote', thanks: 'Thanks! We will reply with a proposal within two days.' },
  );
}

function appointmentBooking() {
  return form(
    [
      field('short_text', { label: 'Full name', required: true }),
      field('phone', { label: 'Phone number', required: true }),
      field('email', { label: 'Email' }),
      choice('dropdown', ['Consultation', 'Follow-up', 'Second opinion'], {
        label: 'Type of appointment',
        required: true,
      }),
      field('date', { label: 'Preferred date', required: true }),
      choice('single_choice', ['Morning', 'Afternoon', 'Evening'], {
        label: 'Preferred time',
        required: true,
      }),
      field('long_text', { label: 'What would you like help with?' }),
    ],
    {
      submit: 'Request appointment',
      thanks: 'Thank you! We will call you to confirm the time.',
    },
  );
}

function contactForm() {
  return form(
    [
      field('short_text', { label: 'Name', required: true }),
      field('email', { label: 'Email', required: true }),
      choice('dropdown', ['A question', 'Sales', 'Support', 'Partnerships', 'Something else'], {
        label: 'What is it about?',
      }),
      field('long_text', { label: 'Message', required: true }),
    ],
    { submit: 'Send message', thanks: 'Thanks for getting in touch! We reply within a day.' },
  );
}

function bugReport() {
  const severity = choice('single_choice', ['Blocks my work', 'Annoying', 'Cosmetic'], {
    label: 'How bad is it?',
    required: true,
  });
  return form(
    [
      field('email', { label: 'Your email', required: true }),
      field('short_text', { label: 'What went wrong?', required: true }),
      field('long_text', {
        label: 'Steps to reproduce',
        placeholder: '1. Go to…\n2. Click…\n3. See…',
        required: true,
      }),
      severity,
      choice('dropdown', ['Chrome', 'Safari', 'Firefox', 'Edge', 'Mobile app'], {
        label: 'Where did it happen?',
      }),
      field('file', {
        label: 'Screenshot',
        fileConfig: { maxSizeMb: 10, allowedTypes: ['image'] },
      }),
      field('yes_no', {
        label: 'May we contact you for more details?',
        conditions: when(severity, 'Blocks my work'),
      }),
    ],
    { submit: 'Report bug', thanks: 'Thank you! Our team will look into it.' },
  );
}

export const BUSINESS_TEMPLATES: FormTemplate[] = [
  {
    id: 'order_form',
    slug: 'order-form',
    name: 'Order form',
    description: 'Take orders with products, delivery or pick-up, and payment.',
    seoDescription:
      'A simple order form for small businesses: products, quantities, delivery or pick-up, address and UPI or cash on delivery.',
    category: 'business',
    presetId: 'paper',
    defaultTitle: 'Order form',
    build: orderForm,
  },
  {
    id: 'catering_order',
    slug: 'catering-order',
    name: 'Catering order',
    description: 'Event date, guests, menu and venue for a catering quote.',
    seoDescription:
      'A catering order and quote request form: event date and time, number of guests, veg or non-veg menu, courses, venue and budget.',
    category: 'business',
    presetId: 'botanical',
    defaultTitle: 'Catering order',
    build: cateringOrder,
  },
  {
    id: 'quote_request',
    slug: 'quote-request',
    name: 'Quote request',
    description: 'Qualify leads with their needs, budget and timeline.',
    seoDescription:
      'A quote request form for agencies and freelancers: services needed, budget range, deadline and project details, to qualify every lead.',
    category: 'business',
    presetId: 'studio',
    defaultTitle: 'Request a quote',
    build: quoteRequest,
  },
  {
    id: 'appointment_booking',
    slug: 'appointment-booking',
    name: 'Appointment booking',
    description: 'Clients request a type of appointment and a preferred time.',
    seoDescription:
      'An appointment booking form for clinics, salons and consultants: appointment type, preferred date and time, and what the visit is about.',
    category: 'business',
    presetId: 'sea-glass',
    defaultTitle: 'Book an appointment',
    build: appointmentBooking,
  },
  {
    id: 'contact_form',
    slug: 'contact-form',
    name: 'Contact form',
    description: 'A simple way for people to reach you.',
    seoDescription:
      'A clean contact form template for your website: name, email, topic and message, with responses in your inbox and dashboard.',
    category: 'business',
    presetId: 'minimal',
    defaultTitle: 'Contact us',
    build: contactForm,
  },
  {
    id: 'bug_report',
    slug: 'bug-report',
    name: 'Bug report',
    description: 'Users report bugs with steps, severity and a screenshot.',
    seoDescription:
      'A bug report form for software teams: what went wrong, steps to reproduce, severity, browser and a screenshot upload.',
    category: 'business',
    presetId: 'minimal-mono',
    defaultTitle: 'Report a bug',
    build: bugReport,
  },
];

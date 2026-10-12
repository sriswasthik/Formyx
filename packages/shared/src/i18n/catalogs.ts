import { en } from './en.js';
import { hi } from './hi.js';
import type { FormLanguage } from './languages.js';
import type { FormMessages } from './messages.js';
import { te } from './te.js';

/**
 * Every catalog, for the server, which answers in each form's language. Browsers load only
 * the one a form needs (English comes with every form; the others on demand).
 */
export const FORM_MESSAGES: Record<FormLanguage, FormMessages> = { en, te, hi };

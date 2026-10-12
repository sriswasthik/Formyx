import { ENGLISH_LOCALE, type FormLocale, type FormMessages } from '@formyx/shared';
import { createContext, useContext } from 'react';

/*
 * The words and formats of the form being drawn: its language's catalog (buttons, checks,
 * dates) and its date and number formats. FormView provides it; everything inside reads it.
 */

/** Provided by FormView (and the screens before it). */
export const FormLocaleContext = createContext<FormLocale>(ENGLISH_LOCALE);

export function useFormLocale(): FormLocale {
  return useContext(FormLocaleContext);
}

/** The form's words. */
export function useFormMessages(): FormMessages {
  return useContext(FormLocaleContext).messages;
}

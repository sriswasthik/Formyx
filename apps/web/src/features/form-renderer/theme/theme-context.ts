import { createDefaultTheme, type FormTheme } from '@formyx/shared';
import { createContext, useContext } from 'react';

const DEFAULT_THEME = createDefaultTheme();

/** The theme ThemeRenderer is drawing, for controls whose markup depends on it. */
export const FormThemeContext = createContext<FormTheme>(DEFAULT_THEME);

/** The theme of the form being drawn; the default look outside a ThemeRenderer. */
export function useFormTheme(): FormTheme {
  return useContext(FormThemeContext);
}

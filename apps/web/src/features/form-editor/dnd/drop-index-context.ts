import { createContext, useContext } from 'react';

/** Where a question dragged from the palette would be inserted, while one is dragged. */
export const DropIndexContext = createContext<number | null>(null);

export function useDropIndex(): number | null {
  return useContext(DropIndexContext);
}

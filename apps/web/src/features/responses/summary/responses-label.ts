import { formatCount } from '../format';

/** "1 response", "1,204 responses" */
export function responsesLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'response' : 'responses'}`;
}

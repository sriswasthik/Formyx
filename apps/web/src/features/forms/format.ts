const numberFormat = new Intl.NumberFormat();

function countLabel(count: number, singular: string, plural: string, none: string): string {
  if (count === 0) return none;
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;
}

export function responseCountLabel(count: number): string {
  return countLabel(count, 'response', 'responses', 'No responses');
}

export function questionCountLabel(count: number): string {
  return countLabel(count, 'question', 'questions', 'No questions');
}

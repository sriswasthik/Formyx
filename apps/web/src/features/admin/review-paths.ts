/** Where in the form a match is: "Question 3", "Title", "End screen 1". */
export function describePath(path: string): string {
  if (path === 'title') return 'Title';
  if (path === 'description') return 'Description';
  const question = /^fields\.(\d+)/.exec(path);
  if (question) return `Question ${String(Number(question[1]) + 1)}`;
  const ending = /^logic\.endScreens\.(\d+)/.exec(path);
  if (ending) return `End screen ${String(Number(ending[1]) + 1)}`;
  return path;
}

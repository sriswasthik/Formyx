import { FORM_TITLE_MAX_LENGTH } from '@formyx/shared';
import { useEditorStore } from '../editor-store-context';

/** The form's title, edited in place in the top bar. */
export function TitleInput() {
  const title = useEditorStore((state) => state.title);
  const setTitle = useEditorStore((state) => state.setTitle);

  return (
    <input
      aria-label="Form title"
      maxLength={FORM_TITLE_MAX_LENGTH}
      value={title}
      placeholder="Untitled form"
      onChange={(event) => {
        setTitle(event.target.value, { mergeKey: 'title' });
      }}
      onBlur={() => {
        // A form always has a title; an emptied one goes back to the default.
        if (!title.trim()) setTitle('Untitled form');
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
      className="h-8 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 text-14 font-medium transition-colors duration-150 ease-standard placeholder:text-muted-foreground hover:border-border focus-visible:border-input"
    />
  );
}

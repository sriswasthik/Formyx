import {
  hasImageBackground,
  hasTextIssues,
  readabilityFixes,
  themeReadabilityIssues,
  type FormTheme,
  type ReadabilityPart,
} from '@formyx/shared';
import { Info } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '../editor-store-context';

const PART_LABELS: Record<ReadabilityPart, string> = {
  text: 'Question text',
  mutedText: 'Hints',
  error: 'Error messages',
  primary: 'The accent colour',
  button: 'Button labels',
  inputText: 'Answers in fields',
};

/**
 * A calm note when the form's text does not stand out from what is behind it (WCAG AA), with
 * one-click fixes. Shown only for text issues; the accent colour has its own note.
 */
export function ReadabilityCallout({ theme }: { theme: FormTheme }) {
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const titleId = useId();
  const { issues, fixes } = useMemo(() => {
    const found = themeReadabilityIssues(theme);
    return {
      issues: found.filter((issue) => issue.part !== 'primary' && issue.part !== 'button'),
      fixes: hasTextIssues(found) ? readabilityFixes(theme) : [],
    };
  }, [theme]);
  if (issues.length === 0) return null;

  const worst = issues.reduce((low, issue) => (issue.ratio < low.ratio ? issue : low));
  const image = hasImageBackground(theme);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border bg-surface p-3"
    >
      <div className="flex gap-2">
        <Info aria-hidden className="mt-0.5 shrink-0 text-warning-text" />
        <div className="flex flex-col gap-1">
          <h3 id={titleId} className="text-13 font-medium">
            Some text may be hard to read
          </h3>
          <p className="text-13 text-muted-foreground">
            {issues.map((issue) => PART_LABELS[issue.part]).join(', ')}{' '}
            {issues.length === 1 ? 'reaches' : 'reach'} {worst.ratio.toFixed(1)}:1 against the
            background in places; text needs {worst.minimum}:1 (WCAG AA).
            {image && ' Images are checked as if they could be any colour.'}
          </p>
        </div>
      </div>
      {fixes.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-6">
          {fixes.map((fix) => (
            <Button
              key={fix.id}
              variant="secondary"
              size="sm"
              title={fix.description}
              onClick={() => {
                updateTheme(() => fix.theme);
              }}
            >
              {fix.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

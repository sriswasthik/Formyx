import { Lightbulb } from 'lucide-react';
import type { HelpBlock } from './articles';

/** An article's text: paragraphs, numbered steps, lists and tips. */
export function HelpArticleBody({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-4 text-14 leading-relaxed">
      {blocks.map((block, index) => {
        // Fixed text that never reorders: its position is its identity.
        const key = index;
        switch (block.type) {
          case 'p':
            return <p key={key}>{block.text}</p>;
          case 'h':
            return (
              <h2 key={key} className="mt-2 text-16 font-semibold tracking-tight">
                {block.text}
              </h2>
            );
          case 'steps':
            return (
              <ol key={key} className="flex flex-col gap-2">
                {block.items.map((item, step) => (
                  <li key={item} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-12 font-medium tabular-nums">
                      {step + 1}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
            );
          case 'list':
            return (
              <ul
                key={key}
                className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case 'tip':
            return (
              <p key={key} className="flex gap-2 rounded-lg border bg-muted/50 px-4 py-3">
                <Lightbulb className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  <span className="font-medium">Tip: </span>
                  {block.text}
                </span>
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

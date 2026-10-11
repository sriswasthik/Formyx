import { parseRichText, type RichInline } from '@formyx/shared';
import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';

function Inline({ nodes }: { nodes: readonly RichInline[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'break':
        return <br key={index} />;
      case 'strong':
        return (
          <strong key={index} className="font-semibold">
            <Inline nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-(--form-accent) underline underline-offset-2"
          >
            <Inline nodes={node.children} />
          </a>
        );
    }
  });
}

/**
 * Statements and consent terms, drawn from the rich-text subset as elements: creators' text
 * never becomes markup. Links open in a new tab.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return (
    <div className={cn('flex flex-col gap-3 break-words', className)}>
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>
            <Inline nodes={block.children} />
          </p>
        ) : (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline nodes={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

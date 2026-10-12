import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const COPIED_FOR_MS = 2000;

/**
 * Copies text, and says "Copied" for a moment. If the clipboard is unavailable, `onFail`
 * selects the text so people can copy it themselves.
 */
export function useCopy(what: string, onFail: () => void) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_FOR_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      onFail();
      toast.error(`Could not copy the ${what}`, {
        description: 'It is selected: copy it yourself.',
      });
    }
  };

  return { copied, copy };
}

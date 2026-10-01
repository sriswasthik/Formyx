import { Check, Copy, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COPIED_FOR_MS = 2000;

/** A new webhook's signing secret, shown this one time, with a way to copy it. */
export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_FOR_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      inputRef.current?.select();
      toast.error('Could not copy the secret', {
        description: 'It is selected: copy it yourself.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <p className="flex items-start gap-2 text-13">
        <KeyRound aria-hidden className="mt-0.5 shrink-0 text-warning-text" />
        <span>
          <span className="font-medium">Copy the signing secret now.</span> It won’t be shown again.
          Use it to check the signature on each request.
        </span>
      </p>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          readOnly
          aria-label="Signing secret"
          value={secret}
          className="min-w-0 flex-1 font-mono text-13"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button variant="secondary" className="shrink-0" onClick={() => void copy()}>
          {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {copied ? 'Secret copied' : ''}
      </span>
      <div>
        <Button variant="ghost" size="sm" onClick={onDone}>
          I’ve saved it
        </Button>
      </div>
    </div>
  );
}

import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { publicFormUrl } from '@/features/forms/form-paths';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { useQrCode } from './use-qr-code';

const COPIED_FOR_MS = 2000;

function CopyLink({ url }: { url: string }) {
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
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select();
      toast.error('Could not copy the link', { description: 'It is selected: copy it yourself.' });
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        ref={inputRef}
        readOnly
        aria-label="Public link"
        value={url}
        className="min-w-0 flex-1"
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
      <Button variant="secondary" className="w-28 shrink-0" onClick={() => void copy()}>
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={copied ? 'copied' : 'copy'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
            className="flex items-center gap-2"
          >
            {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy link'}
          </motion.span>
        </AnimatePresence>
      </Button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}

function QrCode({ url, slug }: { url: string; slug: string }) {
  const qr = useQrCode(url);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border p-4 sm:flex-row">
      {qr.status === 'ready' ? (
        <img
          src={qr.dataUrl}
          alt="QR code for the form's link"
          width={128}
          height={128}
          className="size-32 shrink-0 rounded-md border bg-white"
        />
      ) : (
        <Skeleton className="size-32 shrink-0 rounded-md" />
      )}
      <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <p className="text-14 text-muted-foreground">
          {qr.status === 'error'
            ? 'The QR code could not be made. The link still works.'
            : 'Scan to open the form on a phone, or print it on posters and flyers.'}
        </p>
        {qr.status === 'ready' ? (
          <Button asChild variant="secondary" size="sm">
            <a href={qr.dataUrl} download={`${slug}-qr-code.png`}>
              <Download aria-hidden />
              Download PNG
            </a>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <Download aria-hidden />
            Download PNG
          </Button>
        )}
      </div>
    </div>
  );
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  closed: boolean;
  /** Straight after the first publish, the dialog celebrates a little. */
  justPublished: boolean;
}

/** The public link to copy or open, and a QR code for it. */
export function ShareDialog({ open, onOpenChange, slug, closed, justPublished }: ShareDialogProps) {
  const url = publicFormUrl(slug);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{justPublished ? 'Your form is live' : 'Share your form'}</DialogTitle>
          <DialogDescription>
            {closed
              ? 'The form is closed. People who open the link see that it is not taking responses.'
              : 'Anyone with the link can respond. No account needed.'}
          </DialogDescription>
        </DialogHeader>
        <CopyLink url={url} />
        <QrCode key={url} url={url} slug={slug} />
        <DialogFooter>
          <Button asChild variant="secondary">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open in new tab
            </a>
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

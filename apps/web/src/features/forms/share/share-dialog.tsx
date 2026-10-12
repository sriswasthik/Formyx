import type { QrColors } from '@formyx/shared';
import { Check, Code, Copy, Download, ExternalLink, Link2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useRef, type RefObject } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { publicFormUrl } from '@/features/forms/form-paths';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { embedSnippet } from './embed-snippet';
import { useCopy } from './use-copy';
import { useQrCode } from './use-qr-code';

/** The button's label, swapping to "Copied" with a short fade. */
export function CopyLabel({ copied, label }: { copied: boolean; label: string }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.span
        key={copied ? 'copied' : 'copy'}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
        className="flex items-center gap-2"
      >
        {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
        {copied ? 'Copied' : label}
      </m.span>
    </AnimatePresence>
  );
}

function CopyLink({ url, buttonRef }: { url: string; buttonRef: RefObject<HTMLButtonElement> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopy('link', () => inputRef.current?.select());

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
      <Button
        ref={buttonRef}
        variant="secondary"
        className="w-28 shrink-0"
        onClick={() => void copy(url)}
      >
        <CopyLabel copied={copied} label="Copy link" />
      </Button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}

export function QrCode({
  url,
  slug,
  colors,
}: {
  url: string;
  slug: string;
  colors?: QrColors | undefined;
}) {
  const qr = useQrCode(url, colors);

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

function EmbedCode({ slug }: { slug: string }) {
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const { copied, copy } = useCopy('code', () => codeRef.current?.select());
  const snippet = embedSnippet(slug);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-14 text-muted-foreground">
        Paste this where the form should appear on your site. It grows and shrinks to fit, and sends
        a <code className="font-mono text-13">formyx:submitted</code> event when someone responds.
      </p>
      <textarea
        ref={codeRef}
        readOnly
        aria-label="Embed code"
        value={snippet}
        rows={3}
        spellCheck={false}
        className="w-full resize-none rounded-lg border border-input bg-muted px-3 py-2.5 font-mono text-13 leading-relaxed break-all text-foreground"
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
      <div>
        <Button variant="secondary" className="w-32" onClick={() => void copy(snippet)}>
          <CopyLabel copied={copied} label="Copy code" />
        </Button>
        <span role="status" className="sr-only">
          {copied ? 'Embed code copied' : ''}
        </span>
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
  /** Where focus goes when the dialog closes; it may open without a trigger. */
  returnFocusTo?: RefObject<HTMLElement>;
  /** The QR code's colours, from the form's look (see `qrCodeColors`). */
  qrColors?: QrColors;
}

/** The public link to copy or open, a QR code for it, and code to embed the form. */
export function ShareDialog({
  open,
  onOpenChange,
  slug,
  closed,
  justPublished,
  returnFocusTo,
  qrColors,
}: ShareDialogProps) {
  const url = publicFormUrl(slug);
  const copyButton = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        // Start on "Copy link": copying is what people come for, and Enter does it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          copyButton.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{justPublished ? 'Your form is live' : 'Share your form'}</DialogTitle>
          <DialogDescription>
            {closed
              ? 'The form is closed. People who open the link see that it is not taking responses.'
              : 'Anyone with the link can respond. No account needed.'}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="link">
          <TabsList aria-label="Ways to share">
            <TabsTrigger value="link">
              <Link2 aria-hidden />
              Link
            </TabsTrigger>
            <TabsTrigger value="embed">
              <Code aria-hidden />
              Embed
            </TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="flex flex-col gap-4">
            <CopyLink url={url} buttonRef={copyButton} />
            <QrCode key={url} url={url} slug={slug} colors={qrColors} />
          </TabsContent>
          <TabsContent value="embed">
            <EmbedCode slug={slug} />
          </TabsContent>
        </Tabs>
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

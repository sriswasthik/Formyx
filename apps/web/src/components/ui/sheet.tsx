import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { overlay } from './styles';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay ref={ref} className={cn(overlay, className)} {...props} />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetVariants = cva(
  [
    'fixed z-50 flex flex-col bg-background shadow-dialog',
    'duration-250 ease-standard data-[state=closed]:animate-out data-[state=open]:animate-in',
  ],
  {
    variants: {
      side: {
        left: 'inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r data-[state=closed]:slide-out-to-left-[100%] data-[state=open]:slide-in-from-left-[100%]',
        right:
          'inset-y-0 right-0 h-full w-80 max-w-[85vw] border-l data-[state=closed]:slide-out-to-right-[100%] data-[state=open]:slide-in-from-right-[100%]',
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top-[100%] data-[state=open]:slide-in-from-top-[100%]',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom-[100%] data-[state=open]:slide-in-from-bottom-[100%]',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> &
    VariantProps<typeof sheetVariants> & { showCloseButton?: boolean }
>(({ className, children, side, showCloseButton = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {showCloseButton && (
        <SheetPrimitive.Close
          className={cn(
            'absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground',
            'transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed',
          )}
        >
          <X aria-hidden />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pr-12', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto flex flex-col gap-2 p-5', className)} {...props} />;
}

export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-16 font-semibold tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-14 text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

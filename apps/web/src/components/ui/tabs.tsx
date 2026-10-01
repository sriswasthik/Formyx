import { cva } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsVariant = 'segmented' | 'underline';

const TabsVariantContext = React.createContext<TabsVariant>('segmented');

export const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      segmented: 'h-9 gap-1 rounded-lg bg-muted p-1',
      underline: 'h-10 w-full gap-5 border-b',
    },
  },
});

const tabsTriggerVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 text-14 font-medium whitespace-nowrap',
    'transition-[color,background-color,box-shadow] duration-150 ease-standard',
    'hover:not-disabled:text-foreground disabled:opacity-50',
    'data-[state=active]:text-foreground',
  ],
  {
    variants: {
      variant: {
        // Inactive tabs sit on a muted fill, where muted text is too faint.
        segmented:
          'h-7 rounded-md px-3 text-subtle-foreground data-[state=active]:bg-background data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:data-[state=active]:bg-pressed',
        underline:
          'relative -mb-px h-10 border-b-2 border-transparent px-0.5 text-muted-foreground data-[state=active]:border-foreground',
      },
    },
  },
);

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = 'segmented', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

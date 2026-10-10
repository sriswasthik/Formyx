import { fontStack, type BrandKitData } from '@formyx/shared';
import { useEffect } from 'react';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { cn } from '@/lib/utils';

/**
 * A small picture of a kit: its heading font on its own colours, with its accent beside.
 * The colours are the creator's, shown as data; the frame around them is the builder's.
 */
export function BrandKitSwatch({ kit, className }: { kit: BrandKitData; className?: string }) {
  useEffect(() => {
    void loadFont(kit.headingFont);
  }, [kit.headingFont]);

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-10 w-16 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border',
        className,
      )}
      style={{ backgroundColor: kit.surface }}
    >
      <span
        className="text-16 leading-none"
        style={{
          color: kit.colors.text,
          fontFamily: fontStack(kit.headingFont),
          fontWeight: kit.headingWeight,
        }}
      >
        Aa
      </span>
      <span className="size-3 rounded-full" style={{ backgroundColor: kit.colors.primary }} />
    </span>
  );
}

import { applyBrandKit, brandKitFromTheme, isSameJson, type BrandKit } from '@formyx/shared';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandKitNameDialog } from '@/features/brand-kits/brand-kit-name-dialog';
import { BrandKitSwatch } from '@/features/brand-kits/brand-kit-swatch';
import { useBrandKitMutations, useBrandKits } from '@/features/brand-kits/brand-kits-api';
import { changeErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../editor-store-context';
import { StudioGroup } from './studio-group';

interface KitButtonProps {
  kit: BrandKit;
  isDefault: boolean;
  applied: boolean;
  onApply: () => void;
}

function KitButton({ kit, isDefault, applied, onApply }: KitButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={applied}
      onClick={onApply}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-background p-2 text-left',
        'transition-colors duration-150 ease-standard',
        'hover:border-border-strong active:bg-pressed',
        'aria-pressed:border-accent aria-pressed:bg-accent-subtle',
      )}
    >
      <BrandKitSwatch kit={kit.kit} />
      <span className="flex min-w-0 flex-1 items-center gap-2 text-13 font-medium">
        <span className="truncate">{kit.name}</span>
        {isDefault && <Badge variant="neutral">Default</Badge>}
      </span>
      {applied && <Check aria-hidden className="text-accent" />}
    </button>
  );
}

/**
 * The workspace's brand kits in the Studio: apply one to this form in one click (undo puts
 * the look back), or save this form's logo, colours and fonts as a new one.
 */
export function BrandKitGroup({ workspaceId }: { workspaceId: string }) {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const kits = useBrandKits(workspaceId);
  const { create, setDefault } = useBrandKitMutations(workspaceId);
  const [saving, setSaving] = useState(false);
  const current = brandKitFromTheme(theme);

  let list;
  if (kits.isPending) {
    list = <Skeleton aria-hidden className="h-14 w-full rounded-lg" />;
  } else if (kits.isError) {
    list = (
      <div className="flex items-center justify-between gap-3 text-13 text-muted-foreground">
        <p>Brand kits could not be loaded.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void kits.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  } else if (kits.data.brandKits.length === 0) {
    list = <p className="text-13 text-muted-foreground">No brand kits in this workspace yet.</p>;
  } else {
    list = (
      <ul aria-label="Brand kits" className="flex flex-col gap-2">
        {kits.data.brandKits.map((kit) => (
          <li key={kit.id}>
            <KitButton
              kit={kit}
              isDefault={kit.id === kits.data.defaultBrandKitId}
              applied={isSameJson(current, kit.kit)}
              onApply={() => {
                updateTheme((theme) => applyBrandKit(theme, kit.kit));
                toast.success(`Applied ${kit.name}`);
              }}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <StudioGroup
      title="Brand kits"
      description="Your logo, colours and fonts. This form keeps its layout and background."
    >
      {list}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          setSaving(true);
        }}
      >
        <Plus aria-hidden />
        Save as brand kit
      </Button>
      <BrandKitNameDialog
        open={saving}
        onOpenChange={setSaving}
        title="Save as brand kit"
        description="This form’s logo, colours and fonts, ready to apply to other forms."
        initialName=""
        submitLabel="Save kit"
        offerDefault
        busy={create.isPending || setDefault.isPending}
        onSubmit={({ name, makeDefault }) => {
          create.mutate(
            { name, kit: current },
            {
              onSuccess: (kit) => {
                setSaving(false);
                toast.success(`Saved ${kit.name}`);
                if (makeDefault) setDefault.mutate(kit.id);
              },
              onError: (error) => {
                toast.error('Could not save the brand kit', {
                  description: changeErrorMessage(error),
                });
              },
            },
          );
        }}
      />
    </StudioGroup>
  );
}

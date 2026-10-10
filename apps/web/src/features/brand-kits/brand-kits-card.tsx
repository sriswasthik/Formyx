import { getFont, hasRole, type BrandKit, type WorkspaceSummary } from '@formyx/shared';
import { MoreHorizontal, Palette, Pencil, Star, StarOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { changeErrorMessage } from '@/lib/api';
import { BrandKitNameDialog } from './brand-kit-name-dialog';
import { BrandKitSwatch } from './brand-kit-swatch';
import { useBrandKitMutations, useBrandKits } from './brand-kits-api';

function KitsSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col divide-y">
      {[0, 1].map((row) => (
        <li key={row} className="flex items-center gap-3 py-3">
          <Skeleton className="h-10 w-16 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Fraunces and Source Serif", or one name when headings and text share a font. */
function fontsLine(kit: BrandKit['kit']): string {
  const heading = getFont(kit.headingFont).name;
  const body = getFont(kit.bodyFont).name;
  return heading === body ? heading : `${heading} and ${body}`;
}

/**
 * The workspace's brand kits: logo, colours and fonts saved from a form's Design Studio.
 * Editors and owners rename and delete them, and choose the one new forms start with.
 */
export function BrandKitsCard({ workspace }: { workspace: WorkspaceSummary }) {
  const canManage = hasRole(workspace.role, 'EDITOR');
  const kits = useBrandKits(workspace.id);
  const { update, remove, setDefault } = useBrandKitMutations(workspace.id);
  const [renaming, setRenaming] = useState<BrandKit | null>(null);
  const [deleting, setDeleting] = useState<BrandKit | null>(null);

  const changeDefault = (kit: BrandKit, makeDefault: boolean) => {
    setDefault.mutate(makeDefault ? kit.id : null, {
      onSuccess: () => {
        toast.success(
          makeDefault ? `New forms start with ${kit.name}` : 'New forms start with the plain look',
        );
      },
      onError: (error) => {
        toast.error('Could not change the default', { description: changeErrorMessage(error) });
      },
    });
  };

  let content;
  if (kits.isPending) {
    content = <KitsSkeleton />;
  } else if (kits.isError) {
    content = (
      <ErrorState
        title="Brand kits could not be loaded"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void kits.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (kits.data.brandKits.length === 0) {
    content = (
      <EmptyState
        icon={Palette}
        title="No brand kits yet"
        description="Save one from a form’s Design Studio, under Presets."
        action={
          <Button variant="secondary" asChild>
            <Link to="/app/forms">Go to forms</Link>
          </Button>
        }
      />
    );
  } else {
    const { brandKits, defaultBrandKitId } = kits.data;
    content = (
      <ul aria-label="Brand kits" className="-my-3 flex flex-col divide-y">
        {brandKits.map((kit) => {
          const isDefault = kit.id === defaultBrandKitId;
          return (
            <li key={kit.id} className="flex items-center gap-3 py-3">
              <BrandKitSwatch kit={kit.kit} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-14 font-medium">
                  <span className="truncate">{kit.name}</span>
                  {isDefault && <Badge variant="accent">Default</Badge>}
                </p>
                <p className="truncate text-13 text-muted-foreground">{fontsLine(kit.kit)}</p>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`More actions for ${kit.name}`}>
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        changeDefault(kit, !isDefault);
                      }}
                    >
                      {isDefault ? <StarOff aria-hidden /> : <Star aria-hidden />}
                      {isDefault ? 'Stop using for new forms' : 'Use for new forms'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(kit);
                      }}
                    >
                      <Pencil aria-hidden />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setDeleting(kit);
                      }}
                    >
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand kits</CardTitle>
        <CardDescription>
          {canManage
            ? 'Your logo, colours and fonts, ready to apply to any form. The default one is where new forms start.'
            : 'Logos, colours and fonts this workspace applies to its forms.'}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>

      <BrandKitNameDialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        title="Rename brand kit"
        description="Only people in this workspace see this name."
        initialName={renaming?.name ?? ''}
        submitLabel="Save"
        busy={update.isPending}
        onSubmit={({ name }) => {
          if (!renaming) return;
          update.mutate(
            { id: renaming.id, patch: { name } },
            {
              onSuccess: () => {
                setRenaming(null);
                toast.success('Brand kit renamed');
              },
              onError: (error) => {
                toast.error('Could not rename the brand kit', {
                  description: changeErrorMessage(error),
                });
              },
            },
          );
        }}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Forms that use it keep their look. New forms start with the plain look if it was the
              default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                const { id, name } = deleting;
                remove.mutate(id, {
                  onSuccess: () => {
                    toast.success(`${name} was deleted`);
                  },
                  onError: (error) => {
                    toast.error('Could not delete the brand kit', {
                      description: changeErrorMessage(error),
                    });
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

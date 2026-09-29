import { Copy, LogOut, MoreHorizontal, Pencil, Settings, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Example, Section } from './section';

function DropdownExample() {
  const [showArchived, setShowArchived] = useState(true);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <MoreHorizontal aria-hidden />
          Form actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Customer survey</DropdownMenuLabel>
        <DropdownMenuItem>
          <Pencil aria-hidden />
          Edit
          <DropdownMenuShortcut>E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Copy aria-hidden />
          Duplicate
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Share2 aria-hidden />
            Share
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Copy link</DropdownMenuItem>
            <DropdownMenuItem>Embed code</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuCheckboxItem
          checked={showArchived}
          onCheckedChange={(checked) => {
            setShowArchived(checked);
          }}
        >
          Show archived
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem disabled>
          <Settings aria-hidden />
          Advanced (disabled)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OverlaysSection() {
  return (
    <Section
      id="overlays"
      title="Overlays"
      description="Open each one to check motion, focus trapping and Escape to close."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Example title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Rename form</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename form</DialogTitle>
                <DialogDescription>
                  Respondents will see the new name immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="sg-dialog-name">Name</Label>
                <Input id="sg-dialog-name" defaultValue="Customer survey" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Save</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Example>
        <Example title="Alert dialog">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 aria-hidden />
                Delete form
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “Customer survey”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The form and all 1,204 responses will be permanently deleted. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive">Delete form</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Example>
        <Example title="Sheet">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open settings</Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Form settings</SheetTitle>
                <SheetDescription>Control who can respond and when.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-5">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="sg-sheet-open">Accept responses</Label>
                  <Switch id="sg-sheet-open" defaultChecked />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sg-sheet-limit">Response limit</Label>
                  <Input id="sg-sheet-limit" type="number" placeholder="Unlimited" />
                </div>
              </div>
              <SheetFooter>
                <Button>Save changes</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Example>
        <Example title="Dropdown menu">
          <DropdownExample />
        </Example>
        <Example title="Tooltip">
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Duplicate">
                  <Copy aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Log out">
                  <LogOut aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          </div>
        </Example>
        <Example title="Toasts">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast.success('Form published', {
                  description: 'Share the link to start collecting responses.',
                })
              }
            >
              Success
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info('Autosave is on')}>
              Info
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.warning('This form closes in 2 days')}
            >
              Warning
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast.error('Could not save changes', {
                  description: 'Check your connection and try again.',
                })
              }
            >
              Error
            </Button>
          </div>
        </Example>
      </div>
    </Section>
  );
}

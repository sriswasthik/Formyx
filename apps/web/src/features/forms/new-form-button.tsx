import { ChevronDown, LayoutTemplate, LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NewFormButtonProps {
  /** Creates a blank form and opens it. */
  onBlank: () => void;
  /** Opens the templates to choose from. */
  onTemplates: () => void;
  pending: boolean;
}

/** "New form" makes a blank one; the arrow beside it offers a template instead. */
export function NewFormButton({ onBlank, onTemplates, pending }: NewFormButtonProps) {
  return (
    <div className="flex">
      <Button
        onClick={onBlank}
        disabled={pending}
        aria-busy={pending || undefined}
        className="rounded-r-none"
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
        ) : (
          <Plus aria-hidden />
        )}
        New form
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More ways to start a form"
            disabled={pending}
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={onTemplates}>
            <LayoutTemplate aria-hidden />
            Start from a template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

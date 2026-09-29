import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Example, Section, StateGrid } from './section';

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const;

export function ButtonsSection() {
  return (
    <Section id="buttons" title="Buttons">
      <Example title="Variants and sizes">
        <div className="flex flex-col gap-4">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <Button variant={variant} size="sm">
                Small
              </Button>
              <Button variant={variant}>Medium</Button>
              <Button variant={variant} size="lg">
                Large
              </Button>
              <Button variant={variant}>
                {variant === 'destructive' ? <Trash2 aria-hidden /> : <Plus aria-hidden />}
                With icon
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            {BUTTON_VARIANTS.map((variant) => (
              <Tooltip key={variant}>
                <TooltipTrigger asChild>
                  <Button variant={variant} size="icon" aria-label={`Add (${variant})`}>
                    <Plus aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add ({variant})</TooltipContent>
              </Tooltip>
            ))}
            <Button variant="secondary" size="icon-sm" aria-label="Next">
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      </Example>
      {BUTTON_VARIANTS.map((variant) => (
        <Example key={variant} title={`States · ${variant}`}>
          <StateGrid
            render={(state) => (
              <Button variant={variant} {...state}>
                Button
              </Button>
            )}
          />
        </Example>
      ))}
    </Section>
  );
}

export function InputsSection() {
  return (
    <Section id="inputs" title="Text inputs">
      <Example title="Field">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="sg-email">Email</Label>
          <Input id="sg-email" type="email" placeholder="you@example.com" />
          <p className="text-13 text-muted-foreground">We will never share your email.</p>
        </div>
      </Example>
      <Example title="States · input">
        <StateGrid
          render={(state) => (
            <Input aria-label="Example input" placeholder="Placeholder" {...state} />
          )}
        />
      </Example>
      <Example title="Invalid">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="sg-title">Form title</Label>
          <Input id="sg-title" aria-invalid aria-describedby="sg-title-error" defaultValue="" />
          <p id="sg-title-error" className="text-13 text-danger-text">
            Give your form a title.
          </p>
        </div>
      </Example>
      <Example title="Textarea">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="sg-description">Description</Label>
          <Textarea id="sg-description" placeholder="What is this form about?" />
        </div>
      </Example>
      <Example title="States · textarea">
        <StateGrid
          render={(state) => (
            <Textarea
              aria-label="Example textarea"
              placeholder="Placeholder"
              className="min-h-16"
              {...state}
            />
          )}
        />
      </Example>
      <Example title="Select">
        <div className="grid max-w-md gap-2">
          <Label htmlFor="sg-field-type">Field type</Label>
          <Select defaultValue="short-text">
            <SelectTrigger id="sg-field-type">
              <SelectValue placeholder="Choose a field type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Text</SelectLabel>
                <SelectItem value="short-text">Short text</SelectItem>
                <SelectItem value="long-text">Long text</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Choice</SelectLabel>
                <SelectItem value="multiple-choice">Multiple choice</SelectItem>
                <SelectItem value="checkboxes">Checkboxes</SelectItem>
                <SelectItem value="rating" disabled>
                  Rating (soon)
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Example>
      <Example title="States · select">
        <StateGrid
          render={(state) => (
            <Select>
              <SelectTrigger aria-label="Example select" {...state}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Option A</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Example>
    </Section>
  );
}

export function SelectionSection() {
  return (
    <Section id="selection" title="Selection controls">
      <Example title="Checkbox">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="sg-required" defaultChecked />
            <Label htmlFor="sg-required">Required field</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sg-some" checked="indeterminate" />
            <Label htmlFor="sg-some">Some fields selected</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sg-disabled" disabled />
            <Label htmlFor="sg-disabled">Unavailable option</Label>
          </div>
        </div>
      </Example>
      <Example title="States · checkbox (unchecked and checked)">
        <StateGrid
          render={(state) => (
            <div className="flex gap-3">
              <Checkbox aria-label="Unchecked" {...state} />
              <Checkbox aria-label="Checked" defaultChecked {...state} />
            </div>
          )}
        />
      </Example>
      <Example title="Radio group">
        <RadioGroup defaultValue="anyone" aria-label="Who can respond">
          {[
            { value: 'anyone', label: 'Anyone with the link' },
            { value: 'workspace', label: 'Workspace members' },
            { value: 'nobody', label: 'Nobody (closed)', disabled: true },
          ].map(({ value, label, disabled }) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`sg-radio-${value}`} value={value} disabled={disabled} />
              <Label htmlFor={`sg-radio-${value}`}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </Example>
      <Example title="States · radio (unselected and selected)">
        <StateGrid
          render={(state) => (
            <RadioGroup defaultValue="b" className="flex gap-3" aria-label="Example radio">
              <RadioGroupItem value="a" aria-label="Unselected" {...state} />
              <RadioGroupItem value="b" aria-label="Selected" {...state} />
            </RadioGroup>
          )}
        />
      </Example>
      <Example title="Switch">
        <div className="flex items-center justify-between gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="sg-notify">Email me on new responses</Label>
            <p className="text-13 text-muted-foreground">A daily digest, never more.</p>
          </div>
          <Switch id="sg-notify" defaultChecked />
        </div>
      </Example>
      <Example title="States · switch (off and on)">
        <StateGrid
          render={(state) => (
            <div className="flex gap-3">
              <Switch aria-label="Off" {...state} />
              <Switch aria-label="On" defaultChecked {...state} />
            </div>
          )}
        />
      </Example>
    </Section>
  );
}

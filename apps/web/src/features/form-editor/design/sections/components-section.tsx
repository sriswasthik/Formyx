import { CONTAINER_RADIUS_MAX, RADIUS_MAX, type ThemeComponents } from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { issuesUnder, useDraftIssues } from '../../draft-issues';
import { useEditorStore } from '../../editor-store-context';
import { SliderField, SwitchField } from '../fields';
import { OptionCards } from '../option-cards';
import { StudioGroup } from '../studio-group';

/*
 * Small pictures of each style for the option cards: the builder's own neutral colours,
 * since they describe a shape rather than show the form's look (the preview does that).
 */
const line = 'border-foreground/60';

const INPUT_OPTIONS = [
  {
    value: 'outlined',
    label: 'Outlined',
    preview: <span className={cn('block h-5 w-10 rounded-[5px] border-[1.5px]', line)} />,
  },
  {
    value: 'filled',
    label: 'Filled',
    preview: <span className="block h-5 w-10 rounded-[5px] bg-foreground/15" />,
  },
  {
    value: 'underline',
    label: 'Underline',
    preview: <span className={cn('block h-5 w-10 border-b-[1.5px]', line)} />,
  },
  {
    value: 'pill',
    label: 'Pill',
    preview: <span className={cn('block h-5 w-10 rounded-full border-[1.5px]', line)} />,
  },
  {
    value: 'minimal',
    label: 'Minimal',
    preview: <span className="block h-5 w-10 rounded-[5px] bg-foreground/8" />,
  },
] as const;

const CHOICE_OPTIONS = [
  {
    value: 'list',
    label: 'List',
    preview: (
      <span className="flex flex-col gap-0.5">
        <span className={cn('block h-2.5 w-10 rounded-[3px] border', line)} />
        <span className={cn('block h-2.5 w-10 rounded-[3px] border', line)} />
      </span>
    ),
  },
  {
    value: 'cards',
    label: 'Cards',
    preview: (
      <span className="flex gap-0.5">
        <span className={cn('block h-6 w-5 rounded-[4px] border-[1.5px]', line)} />
        <span className={cn('block h-6 w-5 rounded-[4px] border-[1.5px]', line)} />
      </span>
    ),
  },
  {
    value: 'pills',
    label: 'Pills',
    preview: (
      <span className="flex gap-0.5">
        <span className={cn('block h-3.5 w-5 rounded-full border', line)} />
        <span className={cn('block h-3.5 w-6 rounded-full border', line)} />
      </span>
    ),
  },
  {
    value: 'buttons',
    label: 'Buttons',
    preview: (
      <span className="flex gap-0.5">
        <span className="block h-4 w-5 rounded-[3px] bg-foreground/70" />
        <span className={cn('block h-4 w-5 rounded-[3px] border', line)} />
      </span>
    ),
  },
] as const;

const BUTTON_OPTIONS = [
  {
    value: 'solid',
    label: 'Solid',
    preview: <span className="block h-5 w-10 rounded-[5px] bg-foreground/80" />,
  },
  {
    value: 'outline',
    label: 'Outline',
    preview: <span className={cn('block h-5 w-10 rounded-[5px] border-[1.5px]', line)} />,
  },
  {
    value: 'soft',
    label: 'Soft',
    preview: <span className="block h-5 w-10 rounded-[5px] bg-foreground/15" />,
  },
  {
    value: 'pill',
    label: 'Pill',
    preview: <span className="block h-5 w-10 rounded-full bg-foreground/80" />,
  },
] as const;

const SIZE_OPTIONS = [
  {
    value: 'sm',
    label: 'Small',
    preview: <span className="block h-4 w-8 rounded bg-foreground/60" />,
  },
  {
    value: 'md',
    label: 'Medium',
    preview: <span className="block h-5 w-10 rounded-[5px] bg-foreground/60" />,
  },
  {
    value: 'lg',
    label: 'Large',
    preview: <span className="block h-6.5 w-12 rounded-md bg-foreground/60" />,
  },
] as const;

const CONTAINER_OPTIONS = [
  {
    value: 'none',
    label: 'None',
    preview: <span className={cn('block h-6 w-9 border border-dashed', 'border-foreground/30')} />,
  },
  {
    value: 'card',
    label: 'Card',
    preview: <span className={cn('block h-6 w-9 rounded-[5px] border bg-background', line)} />,
  },
  {
    value: 'floating',
    label: 'Floating',
    preview: <span className="block h-6 w-9 rounded-[5px] bg-background shadow-popover" />,
  },
  {
    value: 'bordered',
    label: 'Bordered',
    preview: <span className={cn('block h-6 w-9 rounded-[5px] border-2', line)} />,
  },
] as const;

const PADDING_OPTIONS = [
  { value: 'compact', label: 'Compact', preview: <PaddingPicture inset="p-0.5" /> },
  { value: 'regular', label: 'Regular', preview: <PaddingPicture inset="p-1" /> },
  { value: 'spacious', label: 'Spacious', preview: <PaddingPicture inset="p-1.5" /> },
] as const;

function PaddingPicture({ inset }: { inset: string }) {
  return (
    <span className={cn('block h-7 w-10 rounded-[5px] border', line, inset)}>
      <span className="block h-full w-full rounded-[2px] bg-foreground/20" />
    </span>
  );
}

const SHADOW_OPTIONS = [
  { value: 'none', label: 'None', preview: <ShadowPicture shadow="" /> },
  { value: 'sm', label: 'Soft', preview: <ShadowPicture shadow="shadow-sm" /> },
  { value: 'md', label: 'Medium', preview: <ShadowPicture shadow="shadow-md" /> },
  { value: 'lg', label: 'Deep', preview: <ShadowPicture shadow="shadow-lg" /> },
] as const;

function ShadowPicture({ shadow }: { shadow: string }) {
  return <span className={cn('block h-5 w-8 rounded-[4px] border bg-background', shadow)} />;
}

/** The radius a container has when the theme does not set one (see theme-variables.ts). */
function defaultContainerRadius(radius: number): number {
  return radius === 0 ? 0 : Math.min(radius + 8, 32);
}

/** How fields, choices, buttons and the form's container are drawn. */
export function ComponentsSection() {
  const components = useEditorStore((state) => state.theme.components);
  const submitText = useEditorStore((state) => state.schema.settings.submitButtonText);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const issues = issuesUnder(useDraftIssues(), 'draftSchema.settings');
  const set = (patch: Partial<ThemeComponents>, options?: { mergeKey: string }) => {
    updateTheme(
      (current) => ({ ...current, components: { ...current.components, ...patch } }),
      options,
    );
  };
  const boxed = components.containerStyle !== 'none';

  return (
    <>
      <StudioGroup title="Fields" description="Every question’s answer box takes this style.">
        <OptionCards
          label="Field style"
          value={components.inputStyle}
          options={INPUT_OPTIONS}
          onChange={(inputStyle) => {
            set({ inputStyle });
          }}
        />
        <SliderField
          label="Corner radius"
          value={components.radius}
          min={0}
          max={RADIUS_MAX}
          format={(value) => `${value}px`}
          mergeKey="components.radius"
          onChange={(radius, options) => {
            set({ radius }, options);
          }}
        />
      </StudioGroup>
      <StudioGroup title="Choices" description="Single and multiple choice questions.">
        <OptionCards
          label="Choice style"
          value={components.choiceStyle}
          options={CHOICE_OPTIONS}
          columns={4}
          onChange={(choiceStyle) => {
            set({ choiceStyle });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Buttons">
        <OptionCards
          label="Button style"
          showLabel
          value={components.buttonStyle}
          options={BUTTON_OPTIONS}
          columns={4}
          onChange={(buttonStyle) => {
            set({ buttonStyle });
          }}
        />
        <OptionCards
          label="Button size"
          showLabel
          value={components.buttonSize}
          options={SIZE_OPTIONS}
          onChange={(buttonSize) => {
            set({ buttonSize });
          }}
        />
        <SwitchField
          label="Full width"
          checked={components.buttonFullWidth}
          onChange={(buttonFullWidth) => {
            set({ buttonFullWidth });
          }}
        />
        <SwitchField
          label="Arrow after the text"
          description={<ArrowRight aria-hidden className="size-3.5" />}
          checked={components.buttonArrow}
          onChange={(buttonArrow) => {
            set({ buttonArrow });
          }}
        />
        <FormField
          id="studio-submit-text"
          label="Submit button text"
          error={issues.submitButtonText}
        >
          <Input
            maxLength={40}
            value={submitText}
            onChange={(event) => {
              updateSettings(
                { submitButtonText: event.target.value },
                { mergeKey: 'submitButtonText' },
              );
            }}
          />
        </FormField>
      </StudioGroup>
      <StudioGroup title="Container" description="What the form sits in, over the background.">
        <OptionCards
          label="Container style"
          value={components.containerStyle}
          options={CONTAINER_OPTIONS}
          columns={4}
          onChange={(containerStyle) => {
            set({ containerStyle });
          }}
        />
        {boxed && (
          <>
            <OptionCards
              label="Padding"
              showLabel
              value={components.containerPadding}
              options={PADDING_OPTIONS}
              onChange={(containerPadding) => {
                set({ containerPadding });
              }}
            />
            <SliderField
              label="Container radius"
              value={components.containerRadius ?? defaultContainerRadius(components.radius)}
              min={0}
              max={CONTAINER_RADIUS_MAX}
              format={(value) => `${value}px`}
              mergeKey="components.containerRadius"
              onChange={(containerRadius, options) => {
                set({ containerRadius }, options);
              }}
            />
            <OptionCards
              label="Shadow"
              showLabel
              value={components.shadow}
              options={SHADOW_OPTIONS}
              columns={4}
              onChange={(shadow) => {
                set({ shadow });
              }}
            />
          </>
        )}
      </StudioGroup>
    </>
  );
}

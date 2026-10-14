import { ButtonsSection, InputsSection, SelectionSection } from './controls';
import { DisplaySection, StatesSection } from './display';
import { ColorsSection, SpacingSection, TypographySection } from './foundations';
import { OverlaysSection } from './overlays';
import { StyleguideHeader } from './styleguide-header';

const SECTIONS = [
  { id: 'typography', label: 'Typography' },
  { id: 'colors', label: 'Colours' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'inputs', label: 'Text inputs' },
  { id: 'selection', label: 'Selection controls' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'display', label: 'Data display' },
  { id: 'states', label: 'Empty and error' },
];

/** Development-only reference for tokens and primitives. Not included in production builds. */
export function StyleguidePage() {
  return (
    <div className="min-h-dvh">
      <StyleguideHeader />

      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14 lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Styleguide sections" className="hidden lg:block">
          <ul className="sticky top-24 flex flex-col gap-1">
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-md px-2 py-1 text-13 text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-col gap-16">
          <div>
            <h1 className="text-32 font-semibold tracking-tighter">Styleguide</h1>
            <p className="mt-2 max-w-2xl text-16 text-muted-foreground">
              Design tokens and UI primitives. State rows force hover, focus and active styles so
              they can be reviewed side by side in both themes.
            </p>
          </div>
          <TypographySection />
          <ColorsSection />
          <SpacingSection />
          <ButtonsSection />
          <InputsSection />
          <SelectionSection />
          <OverlaysSection />
          <DisplaySection />
          <StatesSection />
        </main>
      </div>
    </div>
  );
}

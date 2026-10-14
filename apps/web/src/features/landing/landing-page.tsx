import { BentoGrid } from './bento/bento-grid';
import { BuiltFor } from './built-for';
import { CtaBand } from './cta-band';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { LandingShell } from './landing-shell';
import { SiteFooter } from './site-footer';
import { TemplatesSection } from './templates-section';

/**
 * The home page. The site stays monochrome; the only rich colour comes from the product
 * itself, the forms in their looks.
 */
export function LandingPage() {
  return (
    <LandingShell footer={<SiteFooter />}>
      <Hero />
      <BuiltFor />
      <BentoGrid />
      <HowItWorks />
      <TemplatesSection />
      <CtaBand />
    </LandingShell>
  );
}

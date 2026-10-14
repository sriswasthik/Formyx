import { BentoGrid } from './bento/bento-grid';
import { BuiltFor } from './built-for';
import { CtaBand } from './cta-band';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TemplatesSection } from './templates-section';

/**
 * The home page. The site stays monochrome; the only rich colour comes from the product
 * itself, the forms in their looks.
 */
export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <BuiltFor />
        <BentoGrid />
        <HowItWorks />
        <TemplatesSection />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

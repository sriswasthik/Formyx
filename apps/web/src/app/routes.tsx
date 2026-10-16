import { Navigate, type RouteObject } from 'react-router';
import { NotFoundPage } from './not-found-page';
import { RootLayout, RouteFallback } from './root-layout';
import type { RouteHandle } from './route-handle';
import { RouteErrorPage } from './route-error-page';

const devOnlyRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'styleguide',
        handle: { title: 'Styleguide' } satisfies RouteHandle,
        lazy: async () => {
          const { StyleguidePage } = await import('@/features/styleguide/styleguide-page');
          return { Component: StyleguidePage };
        },
      },
      {
        path: 'styleguide/brand',
        handle: { title: 'Brand' } satisfies RouteHandle,
        lazy: async () => {
          const { BrandPage } = await import('@/features/styleguide/brand-page');
          return { Component: BrandPage };
        },
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: RouteFallback,
    children: [
      // Every page is its own chunk, so the entry stays small for whichever page comes first,
      // above all public forms.
      {
        index: true,
        lazy: async () => {
          const { LandingPage } = await import('@/features/landing/landing-page');
          return { Component: LandingPage };
        },
      },
      {
        path: 'pricing',
        handle: { title: 'Pricing' } satisfies RouteHandle,
        lazy: async () => {
          const { PricingPage } = await import('@/features/pricing/pricing-page');
          return { Component: PricingPage };
        },
      },
      {
        path: 'templates',
        handle: { title: 'Form templates' } satisfies RouteHandle,
        lazy: async () => {
          const { TemplatesPage } = await import('@/features/templates/templates-page');
          return { Component: TemplatesPage };
        },
      },
      {
        path: 'templates/:slug',
        // Replaced by "<template> template" once it is found.
        handle: { title: 'Template' } satisfies RouteHandle,
        lazy: async () => {
          const { TemplatePage } = await import('@/features/templates/template-page');
          return { Component: TemplatePage };
        },
      },
      {
        path: 'features/design-studio',
        handle: { title: 'Design Studio' } satisfies RouteHandle,
        lazy: async () => {
          const { DesignStudioPage } = await import('@/features/marketing/feature-pages');
          return { Component: DesignStudioPage };
        },
      },
      {
        path: 'features/logic',
        handle: { title: 'Logic' } satisfies RouteHandle,
        lazy: async () => {
          const { LogicPage } = await import('@/features/marketing/feature-pages');
          return { Component: LogicPage };
        },
      },
      {
        path: 'features/integrations',
        handle: { title: 'Integrations' } satisfies RouteHandle,
        lazy: async () => {
          const { IntegrationsPage } = await import('@/features/marketing/feature-pages');
          return { Component: IntegrationsPage };
        },
      },
      {
        path: 'terms',
        handle: { title: 'Terms of service' } satisfies RouteHandle,
        lazy: async () => {
          const { TermsPage } = await import('@/features/legal/policies');
          return { Component: TermsPage };
        },
      },
      {
        path: 'privacy',
        handle: { title: 'Privacy policy' } satisfies RouteHandle,
        lazy: async () => {
          const { PrivacyPage } = await import('@/features/legal/policies');
          return { Component: PrivacyPage };
        },
      },
      {
        path: 'refunds',
        handle: { title: 'Refund and cancellation policy' } satisfies RouteHandle,
        lazy: async () => {
          const { RefundsPage } = await import('@/features/legal/policies');
          return { Component: RefundsPage };
        },
      },
      {
        path: 'shipping',
        handle: { title: 'Shipping and delivery policy' } satisfies RouteHandle,
        lazy: async () => {
          const { ShippingPage } = await import('@/features/legal/policies');
          return { Component: ShippingPage };
        },
      },
      {
        path: 'contact',
        handle: { title: 'Contact us' } satisfies RouteHandle,
        lazy: async () => {
          const { ContactPage } = await import('@/features/legal/contact-page');
          return { Component: ContactPage };
        },
      },
      {
        // The link in the "Confirm your email" message; signed in or not.
        path: 'verify-email',
        handle: { title: 'Confirm your email' } satisfies RouteHandle,
        lazy: async () => {
          const { VerifyEmailPage } = await import('@/features/auth/verify-email-page');
          return { Component: VerifyEmailPage };
        },
      },
      {
        // "Keep my account" in the email sent when an account is set to be deleted.
        path: 'account/restore',
        handle: { title: 'Keep your account' } satisfies RouteHandle,
        lazy: async () => {
          const { RestoreAccountPage } = await import('@/features/privacy/restore-account-page');
          return { Component: RestoreAccountPage };
        },
      },
      {
        // "Report this form", linked from under every public form.
        path: 'report/:slug',
        handle: { title: 'Report a form' } satisfies RouteHandle,
        lazy: async () => {
          const { ReportPage } = await import('@/features/trust/report-page');
          return { Component: ReportPage };
        },
      },
      {
        path: 'help',
        handle: { title: 'Help centre' } satisfies RouteHandle,
        lazy: async () => {
          const { HelpCentrePage } = await import('@/features/help/help-centre-page');
          return { Component: HelpCentrePage };
        },
      },
      {
        path: 'help/:slug',
        // Replaced by the article's title once it is found.
        handle: { title: 'Help' } satisfies RouteHandle,
        lazy: async () => {
          const { HelpArticlePage } = await import('@/features/help/help-article-page');
          return { Component: HelpArticlePage };
        },
      },
      {
        path: 'changelog',
        handle: { title: 'Changelog' } satisfies RouteHandle,
        lazy: async () => {
          const { ChangelogPage } = await import('@/features/changelog/changelog-page');
          return { Component: ChangelogPage };
        },
      },
      // Log in and sign up: signed-in visitors are sent on to the app.
      {
        lazy: async () => {
          const { GuestRoute } = await import('@/features/auth/guest-route');
          return { Component: GuestRoute };
        },
        children: [
          {
            path: 'login',
            handle: { title: 'Log in' } satisfies RouteHandle,
            lazy: async () => {
              const { LoginPage } = await import('@/features/auth/login-page');
              return { Component: LoginPage };
            },
          },
          {
            path: 'signup',
            handle: { title: 'Sign up' } satisfies RouteHandle,
            lazy: async () => {
              const { SignupPage } = await import('@/features/auth/signup-page');
              return { Component: SignupPage };
            },
          },
        ],
      },
      // Signed-in pages are split out so marketing visitors never download them.
      {
        path: 'app',
        lazy: async () => {
          const { ProtectedRoute } = await import('@/features/auth/protected-route');
          return { Component: ProtectedRoute };
        },
        children: [
          {
            lazy: async () => {
              const { AppShell } = await import('@/features/shell/app-shell');
              return { Component: AppShell };
            },
            children: [
              { index: true, element: <Navigate to="forms" replace /> },
              {
                path: 'forms',
                handle: { title: 'Forms' } satisfies RouteHandle,
                lazy: async () => {
                  const { FormsPage } = await import('@/features/forms/forms-page');
                  return { Component: FormsPage };
                },
              },
              {
                path: 'forms/:formId',
                // Replaced by the form's own title once it loads.
                handle: {
                  title: 'Form',
                  parent: { title: 'Forms', to: '/app/forms' },
                } satisfies RouteHandle,
                lazy: async () => {
                  const { FormDetailPage } = await import('@/features/forms/form-detail-page');
                  return { Component: FormDetailPage };
                },
              },
              {
                path: 'admin',
                handle: { title: 'Admin' } satisfies RouteHandle,
                lazy: async () => {
                  const { AdminPage } = await import('@/features/admin/admin-page');
                  return { Component: AdminPage };
                },
              },
              {
                path: 'settings',
                handle: { title: 'Settings' } satisfies RouteHandle,
                lazy: async () => {
                  const { SettingsLayout } = await import('@/features/settings/settings-layout');
                  return { Component: SettingsLayout };
                },
                children: [
                  {
                    index: true,
                    handle: { title: 'Preferences' } satisfies RouteHandle,
                    lazy: async () => {
                      const { PreferencesPage } =
                        await import('@/features/settings/preferences-page');
                      return { Component: PreferencesPage };
                    },
                  },
                  {
                    path: 'workspace',
                    handle: { title: 'Workspace' } satisfies RouteHandle,
                    lazy: async () => {
                      const { WorkspaceSettingsPage } =
                        await import('@/features/settings/workspace/workspace-settings-page');
                      return { Component: WorkspaceSettingsPage };
                    },
                  },
                  {
                    path: 'members',
                    handle: { title: 'Members' } satisfies RouteHandle,
                    lazy: async () => {
                      const { MembersPage } =
                        await import('@/features/settings/workspace/members-page');
                      return { Component: MembersPage };
                    },
                  },
                  {
                    path: 'brand-kits',
                    handle: { title: 'Brand kits' } satisfies RouteHandle,
                    lazy: async () => {
                      const { BrandKitsPage } =
                        await import('@/features/brand-kits/brand-kits-page');
                      return { Component: BrandKitsPage };
                    },
                  },
                  {
                    path: 'billing',
                    handle: { title: 'Billing' } satisfies RouteHandle,
                    lazy: async () => {
                      const { BillingPage } = await import('@/features/billing/billing-page');
                      return { Component: BillingPage };
                    },
                  },
                  {
                    path: 'referrals',
                    handle: { title: 'Referrals' } satisfies RouteHandle,
                    lazy: async () => {
                      const { ReferralsPage } = await import('@/features/settings/referrals-page');
                      return { Component: ReferralsPage };
                    },
                  },
                ],
              },
            ],
          },
          // A form's own pages take the whole screen, outside the app shell.
          {
            path: 'forms/:formId/edit',
            handle: { title: 'Edit form' } satisfies RouteHandle,
            lazy: async () => {
              const { EditorPage } = await import('@/features/form-editor/editor-page');
              return { Component: EditorPage };
            },
          },
          {
            path: 'forms/:formId/responses',
            // Replaced by "<form title> responses" once the form loads.
            handle: { title: 'Responses' } satisfies RouteHandle,
            lazy: async () => {
              const { ResponsesPage } = await import('@/features/responses/responses-page');
              return { Component: ResponsesPage };
            },
          },
          {
            path: 'forms/:formId/integrations',
            // Replaced by "Integrations · <form title>" once the form loads.
            handle: { title: 'Integrations' } satisfies RouteHandle,
            lazy: async () => {
              const { IntegrationsPage } =
                await import('@/features/integrations/integrations-page');
              return { Component: IntegrationsPage };
            },
          },
          {
            path: 'forms/:formId/settings',
            // Replaced by "Settings · <form title>" once the form loads.
            handle: { title: 'Form settings' } satisfies RouteHandle,
            lazy: async () => {
              const { FormSettingsPage } =
                await import('@/features/form-settings/form-settings-page');
              return { Component: FormSettingsPage };
            },
          },
        ],
      },
      // Published forms, for anyone with the link. Split out, and free of editor and app code.
      {
        path: 'f/:slug',
        handle: { title: 'Form' } satisfies RouteHandle,
        lazy: async () => {
          const { PublicFormPage } = await import('@/features/public-form/public-form-page');
          return { Component: PublicFormPage };
        },
      },
      // The link in an invite email; it works signed in or out.
      {
        path: 'unsubscribe/:token',
        handle: { title: 'Email preferences' } satisfies RouteHandle,
        lazy: async () => {
          const { UnsubscribePage } = await import('@/features/emails/unsubscribe-page');
          return { Component: UnsubscribePage };
        },
      },
      {
        path: 'invite/:token',
        handle: { title: 'Invite' } satisfies RouteHandle,
        lazy: async () => {
          const { InvitePage } = await import('@/features/invites/invite-page');
          return { Component: InvitePage };
        },
      },
      ...devOnlyRoutes,
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { title: 'Page not found' } satisfies RouteHandle,
      },
    ],
  },
];

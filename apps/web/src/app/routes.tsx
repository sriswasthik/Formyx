import { Navigate, type RouteObject } from 'react-router';
import { LandingPage } from '@/features/landing/landing-page';
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
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: RouteFallback,
    children: [
      // The public landing page ships in the entry chunk for the fastest first paint.
      { index: true, element: <LandingPage /> },
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
                handle: { title: 'Form' } satisfies RouteHandle,
                lazy: async () => {
                  const { FormDetailPage } = await import('@/features/forms/form-detail-page');
                  return { Component: FormDetailPage };
                },
              },
              {
                path: 'settings',
                handle: { title: 'Settings' } satisfies RouteHandle,
                lazy: async () => {
                  const { SettingsPage } = await import('@/features/settings/settings-page');
                  return { Component: SettingsPage };
                },
              },
            ],
          },
          // The editor takes the whole screen, outside the app shell.
          {
            path: 'forms/:formId/edit',
            handle: { title: 'Edit form' } satisfies RouteHandle,
            lazy: async () => {
              const { EditorPage } = await import('@/features/form-editor/editor-page');
              return { Component: EditorPage };
            },
          },
        ],
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

import type { RouteObject } from 'react-router';
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
      // Signed-in pages are split out so marketing visitors never download them.
      {
        lazy: async () => {
          const { AppShell } = await import('@/features/shell/app-shell');
          return { Component: AppShell };
        },
        children: [
          {
            path: 'forms',
            handle: { title: 'Forms' } satisfies RouteHandle,
            lazy: async () => {
              const { FormsPage } = await import('@/features/forms/forms-page');
              return { Component: FormsPage };
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
      ...devOnlyRoutes,
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { title: 'Page not found' } satisfies RouteHandle,
      },
    ],
  },
];

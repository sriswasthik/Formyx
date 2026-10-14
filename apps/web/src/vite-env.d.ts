/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the live-updates socket when it is not this site, e.g. `https://api.formyx.app`. */
  readonly VITE_REALTIME_URL?: string;
  /** "true" shows "Try the demo" on the landing page; the API needs DEMO_ENABLED as well. */
  readonly VITE_DEMO_ENABLED?: string;
  /** Sentry project DSN for the web app. Empty: errors stay in the browser console. */
  readonly VITE_SENTRY_DSN?: string;
  /** The release errors are filed under, e.g. the commit being deployed. */
  readonly VITE_SENTRY_RELEASE?: string;
  /** Razorpay Checkout's script; only end-to-end tests change it (a stand-in). */
  readonly VITE_RAZORPAY_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** The public form request index.html starts before the app loads (see public-form-api.ts). */
  __formyxPrefetch?: { slug: string; response: Promise<Response> };
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the live-updates socket when it is not this site, e.g. `https://api.formyx.app`. */
  readonly VITE_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** The public form request index.html starts before the app loads (see public-form-api.ts). */
  __formyxPrefetch?: { slug: string; response: Promise<Response> };
}

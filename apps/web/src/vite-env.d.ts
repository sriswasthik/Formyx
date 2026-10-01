/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the live-updates socket when it is not this site, e.g. `https://api.formyx.app`. */
  readonly VITE_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

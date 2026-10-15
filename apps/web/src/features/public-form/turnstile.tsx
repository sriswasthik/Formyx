import { useEffect, useRef } from 'react';

/*
 * Cloudflare Turnstile, the spam check a form can switch on. Its script loads only on such
 * forms. "Interaction only": most people never see it; the few it is unsure about get a
 * checkbox above the send button. The token it gives travels with the response.
 */

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** How long sending waits for a check still running before going without a token. */
const TOKEN_WAIT_MS = 5000;

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      appearance: 'interaction-only';
      theme: 'auto';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile did not start'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile could not be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

/** What sending needs from the check. */
export interface TurnstileHandle {
  /** The token, waiting a moment for a check still running; undefined if there is none. */
  token: () => Promise<string | undefined>;
  /** After a refused token: run the check again. */
  reset: () => void;
}

export function Turnstile({
  siteKey,
  handleRef,
}: {
  siteKey: string;
  /** Filled in once the widget is up, for sending to ask for the token. */
  handleRef: { current: TurnstileHandle | null };
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let token: string | undefined;
    let widgetId: string | null = null;
    let api: TurnstileApi | null = null;
    let cancelled = false;

    handleRef.current = {
      token: async () => {
        const deadline = Date.now() + TOKEN_WAIT_MS;
        while (token === undefined && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return token;
      },
      reset: () => {
        token = undefined;
        if (api && widgetId !== null) api.reset(widgetId);
      },
    };

    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !container.current) return;
        api = loaded;
        widgetId = loaded.render(container.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          theme: 'auto',
          callback: (value) => {
            token = value;
          },
          'expired-callback': () => {
            token = undefined;
          },
          'error-callback': () => {
            token = undefined;
          },
        });
      })
      .catch(() => {
        // Blocked or offline: sending goes without a token, and the form says so if refused.
      });

    return () => {
      cancelled = true;
      if (api && widgetId !== null) api.remove(widgetId);
      handleRef.current = null;
    };
  }, [siteKey, handleRef]);

  return <div ref={container} />;
}

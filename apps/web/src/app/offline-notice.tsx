import { useEffect } from 'react';

const OFFLINE_TOAST_ID = 'offline';

/**
 * Says when the connection drops, for as long as it stays down, and when it is back. Renders
 * nothing itself: it uses toasts, loaded only if needed.
 */
export function OfflineNotice() {
  useEffect(() => {
    let shown = false;

    const offline = () => {
      shown = true;
      void import('sonner').then(({ toast }) => {
        toast.warning("You're offline", {
          id: OFFLINE_TOAST_ID,
          description: "Some things won't work until your connection is back.",
          duration: Infinity,
        });
      });
    };
    const online = () => {
      if (!shown) return;
      shown = false;
      void import('sonner').then(({ toast }) => {
        toast.dismiss(OFFLINE_TOAST_ID);
        toast.success('Back online', { duration: 3000 });
      });
    };

    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  return null;
}

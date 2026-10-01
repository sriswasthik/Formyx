import { act, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { OfflineNotice } from './offline-notice';

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Toasts live in a store shared by every Toaster: start each test without any.
  act(() => {
    toast.dismiss();
  });
});

describe('OfflineNotice', () => {
  it('says the connection dropped until it is back', async () => {
    render(
      <>
        <OfflineNotice />
        <Toaster />
      </>,
    );
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();

    setOnline(false);
    expect(await screen.findByText("You're offline")).toBeInTheDocument();

    setOnline(true);
    expect(await screen.findByText('Back online')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
    });
  });

  it('notices a page opened while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(
      <>
        <OfflineNotice />
        <Toaster />
      </>,
    );
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
  });

  it('stays quiet when coming online without having been offline', async () => {
    render(
      <>
        <OfflineNotice />
        <Toaster />
      </>,
    );
    setOnline(true);
    // Nothing to announce: give a toast the chance to appear, then check it did not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Back online')).not.toBeInTheDocument();
  });
});

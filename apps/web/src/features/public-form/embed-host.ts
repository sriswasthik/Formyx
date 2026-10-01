import { useEffect } from 'react';

/*
 * How an embedded form talks to the page around it (see public/embed.js): it reports its height,
 * so the iframe can grow and shrink with it, and says when a response was sent. Messages carry
 * nothing private, but still go only to the host's origin when embed.js passed it.
 */

export const HOST_MESSAGE_SOURCE = 'formyx';

export type HostMessage =
  | {
      source: typeof HOST_MESSAGE_SOURCE;
      type: 'resize';
      slug: string;
      height: number;
      title?: string;
    }
  | { source: typeof HOST_MESSAGE_SOURCE; type: 'submitted'; slug: string };

/** A message without its `source`, which `postToHost` adds; one variant at a time. */
type HostMessageBody<M = HostMessage> = M extends HostMessage ? Omit<M, 'source'> : never;

/**
 * The origin to post to: the `parent` query parameter embed.js adds, when it is exactly an
 * origin. Anything else (missing, a full URL, "null" for file:// pages) falls back to `*`.
 */
export function hostTargetOrigin(parent: string | null): string {
  if (!parent) return '*';
  try {
    const { origin } = new URL(parent);
    return origin !== 'null' && origin === parent ? origin : '*';
  } catch {
    return '*';
  }
}

export function postToHost(message: HostMessageBody, targetOrigin: string): void {
  // Opened on its own rather than in an iframe: nobody to tell.
  if (window.parent === window) return;
  window.parent.postMessage({ source: HOST_MESSAGE_SOURCE, ...message }, targetOrigin);
}

/** Keeps the host's iframe as tall as the page, for as long as `enabled`. */
export function useReportHeight({
  enabled,
  slug,
  title,
  targetOrigin,
}: {
  enabled: boolean;
  slug: string;
  title: string | undefined;
  targetOrigin: string;
}) {
  useEffect(() => {
    if (!enabled) return;
    let last = -1;
    const report = () => {
      // The body, not the viewport: the iframe must be able to shrink as well as grow.
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      postToHost({ type: 'resize', slug, height, ...(title && { title }) }, targetOrigin);
    };
    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    report();
    return () => {
      observer.disconnect();
    };
  }, [enabled, slug, title, targetOrigin]);
}

/*
 * The parts of the WHATWG URL API shared code uses. Browsers and Node both have it, but no
 * TypeScript lib short of DOM declares it, and shared code must not lean on DOM or Node
 * types. Only the build sees this file: type checks and tests get the real declarations
 * through Vitest's Node types, and apps through their own.
 */

interface URLSearchParams {
  get(name: string): string | null;
  set(name: string, value: string): void;
}

interface URL {
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}

declare const URL: new (input: string, base?: string) => URL;

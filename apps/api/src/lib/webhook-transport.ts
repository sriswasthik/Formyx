import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/*
 * Sends webhook requests without letting them reach private networks (SSRF). Addresses are
 * checked when the connection is made, through the DNS lookup the socket itself uses, so a
 * hostname that resolves differently later (DNS rebinding) is caught too.
 */

const blocked = new BlockList();
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, including cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved and broadcast
];
const BLOCKED_V6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  // No ::ffff:0:0/96 rule: BlockList checks IPv4 addresses against IPv6 rules in their
  // mapped form, so it would block every IPv4 address. Mapped addresses are converted below.
  ['64:ff9b::', 96], // NAT64
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];
for (const [network, prefix] of BLOCKED_V4) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_V6) blocked.addSubnet(network, prefix, 'ipv6');

/** The IPv4 address inside an IPv4-mapped IPv6 address (`::ffff:7f00:1`), in any spelling. */
function mappedIPv4(ipv6: string): string | null {
  let canonical: string;
  try {
    // URLs write IPv6 hosts in one canonical, compressed form.
    canonical = new URL(`http://[${ipv6}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(canonical);
  if (dotted?.[1]) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(canonical);
  if (!hex?.[1] || !hex[2]) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** True for loopback, private, link-local and other addresses that are not on the internet. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 4) return blocked.check(bare, 'ipv4');
  if (family === 6) {
    const mapped = mappedIPv4(bare);
    return mapped ? blocked.check(mapped, 'ipv4') : blocked.check(bare, 'ipv6');
  }
  // Not an IP address at all: nothing to connect to.
  return true;
}

const PRIVATE_HOSTNAMES = /(^|\.)(localhost|local|internal|home\.arpa)$/i;

/**
 * Why a webhook URL is not allowed, or `null` if it is. With `allowPrivate` (development
 * only), plain http and local addresses are fine, so a receiver on localhost works.
 */
export function webhookUrlProblem(
  url: string,
  { allowPrivate }: { allowPrivate: boolean },
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Use a full URL, such as https://example.com/hooks';
  }
  if (parsed.username || parsed.password) return 'Leave the username and password out of the URL';
  if (allowPrivate) {
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? null
      : 'Use an http(s) URL';
  }
  if (parsed.protocol !== 'https:') return 'Use an https:// URL';
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTNAMES.test(host) || (isIP(host) !== 0 && isPrivateAddress(host))) {
    return 'Use a public address: Formyx can’t send to local or private networks';
  }
  return null;
}

/** A failed delivery with no HTTP response, and why, in words for the delivery log. */
export class DeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryError';
  }
}

export interface DeliveryRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** Sends one request; resolves with the receiver's status, or throws a `DeliveryError`. */
export type WebhookTransport = (request: DeliveryRequest) => Promise<{ statusCode: number }>;

function describeNetworkError(error: NodeJS.ErrnoException): string {
  switch (error.code) {
    case 'ECONNREFUSED':
      return 'Connection refused';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Host not found';
    case 'ECONNRESET':
    case 'EPIPE':
      return 'Connection reset';
    case 'ETIMEDOUT':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return 'Host unreachable';
    default:
      if (error.code?.includes('CERT') || error.code?.startsWith('ERR_TLS')) {
        return 'TLS certificate problem';
      }
      return 'Could not connect';
  }
}

export function createWebhookTransport({
  allowPrivate,
  timeoutMs = 10_000,
}: {
  allowPrivate: boolean;
  timeoutMs?: number;
}): WebhookTransport {
  /** The DNS lookup sockets use: refuses to connect anywhere private. */
  const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      if (!allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
        callback(new DeliveryError(`Blocked: ${hostname} points to a private address`), '', 0);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const [first] = addresses;
      if (!first) {
        callback(new DeliveryError('Host not found'), '', 0);
        return;
      }
      callback(null, first.address, first.family);
    });
  };

  return ({ url, body, headers }) =>
    new Promise((resolve, reject) => {
      const target = new URL(url);
      // IP addresses in the URL skip DNS, so check them here.
      if (!allowPrivate && isIP(target.hostname.replace(/^\[|\]$/g, '')) !== 0) {
        if (isPrivateAddress(target.hostname)) {
          reject(new DeliveryError(`Blocked: ${target.hostname} is a private address`));
          return;
        }
      }

      const client = target.protocol === 'https:' ? https : http;
      const request = client.request(target, {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: guardedLookup,
      });
      const deadline = setTimeout(() => {
        request.destroy(new DeliveryError(`No response within ${timeoutMs / 1000} s`));
      }, timeoutMs);

      request.on('response', (response) => {
        clearTimeout(deadline);
        resolve({ statusCode: response.statusCode ?? 0 });
        // The body is not used; close the connection rather than read it.
        response.destroy();
      });
      request.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(deadline);
        reject(
          error instanceof DeliveryError ? error : new DeliveryError(describeNetworkError(error)),
        );
      });
      request.end(body);
    });
}

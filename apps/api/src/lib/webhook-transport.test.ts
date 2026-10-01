import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { closedPort, startWebhookReceiver } from '../test/webhook-receiver.js';
import {
  createWebhookTransport,
  DeliveryError,
  isPrivateAddress,
  webhookUrlProblem,
} from './webhook-transport.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:a00:1',
    '[::1]',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe('webhookUrlProblem', () => {
  it.each([
    ['http://example.com/hook', 'Use an https:// URL'],
    [
      'https://localhost/hook',
      'Use a public address: Formyx can’t send to local or private networks',
    ],
    [
      'https://printer.local/hook',
      'Use a public address: Formyx can’t send to local or private networks',
    ],
    [
      'https://10.0.0.5/hook',
      'Use a public address: Formyx can’t send to local or private networks',
    ],
    [
      'https://169.254.169.254/latest/meta-data',
      'Use a public address: Formyx can’t send to local or private networks',
    ],
    ['https://[::1]/hook', 'Use a public address: Formyx can’t send to local or private networks'],
    ['https://user:pass@example.com/hook', 'Leave the username and password out of the URL'],
    ['ftp://example.com', 'Use an https:// URL'],
  ])('refuses %s', (url, problem) => {
    expect(webhookUrlProblem(url, { allowPrivate: false })).toBe(problem);
  });

  it('takes public https URLs', () => {
    expect(
      webhookUrlProblem('https://hooks.example.com/formyx?x=1', { allowPrivate: false }),
    ).toBeNull();
  });

  it('takes local and plain http URLs when allowed, for development', () => {
    expect(webhookUrlProblem('http://localhost:4000/hook', { allowPrivate: true })).toBeNull();
    expect(webhookUrlProblem('ftp://localhost/hook', { allowPrivate: true })).toBe(
      'Use an http(s) URL',
    );
  });
});

describe('createWebhookTransport', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function receiver(status = 200) {
    const started = await startWebhookReceiver(() => status);
    cleanups.push(started.close);
    return started;
  }

  it('posts the body with the given headers and reports the status', async () => {
    const target = await receiver(202);
    const send = createWebhookTransport({ allowPrivate: true });

    const result = await send({
      url: target.url,
      body: '{"a":"é"}',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' },
    });

    expect(result).toEqual({ statusCode: 202 });
    expect(target.requests).toEqual([
      expect.objectContaining({ method: 'POST', path: '/hooks/formyx', body: '{"a":"é"}' }),
    ]);
    expect(target.requests[0]?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-test': 'yes',
      'content-length': '10',
    });
  });

  it('refuses private addresses, by IP or by name, before connecting', async () => {
    const target = await receiver();
    const send = createWebhookTransport({ allowPrivate: false });

    await expect(send({ url: target.url, body: '{}', headers: {} })).rejects.toThrow(
      new DeliveryError('Blocked: 127.0.0.1 is a private address'),
    );
    await expect(
      send({ url: `http://localhost:${target.port}/hook`, body: '{}', headers: {} }),
    ).rejects.toThrow('Blocked: localhost points to a private address');
    expect(target.requests).toEqual([]);
  });

  it('explains connections that fail or never answer', async () => {
    const send = createWebhookTransport({ allowPrivate: true, timeoutMs: 100 });
    await expect(
      send({ url: `http://127.0.0.1:${await closedPort()}/`, body: '{}', headers: {} }),
    ).rejects.toThrow(new DeliveryError('Connection refused'));

    // Takes the request and never answers.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => {
      silent.listen(0, '127.0.0.1', resolve);
    });
    cleanups.push(
      () =>
        new Promise((resolve) => {
          silent.closeAllConnections();
          silent.close(() => {
            resolve();
          });
        }),
    );
    const { port } = silent.address() as AddressInfo;
    await expect(
      send({ url: `http://127.0.0.1:${port}/`, body: '{}', headers: {} }),
    ).rejects.toThrow(new DeliveryError('No response within 0.1 s'));
  });
});

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createSecretBox,
  newWebhookSecret,
  signWebhookBody,
  verifyWebhookSignature,
} from './webhook-signature.js';

const body = '{"id":"evt_1","event":"submission.created","answers":["café ☕"]}';

describe('signWebhookBody', () => {
  it('is sha256= and the hex HMAC-SHA256 of the exact body, keyed with the secret', () => {
    const signature = signWebhookBody(body, 'whsec_test');

    expect(signature).toBe(
      `sha256=${createHmac('sha256', 'whsec_test').update(Buffer.from(body, 'utf8')).digest('hex')}`,
    );
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('matches a known value, so receivers in any language can check their code against it', () => {
    // Also what `printf '{"hello":"world"}' | openssl dgst -sha256 -hmac whsec_test` prints.
    expect(signWebhookBody('{"hello":"world"}', 'whsec_test')).toBe(
      'sha256=07ea4d7892d3dc4bae220d9930afa38c458a997b2f716a0a6159e17798be1d28',
    );
  });

  it('changes with the secret and with any change to the body', () => {
    const signature = signWebhookBody(body, 'whsec_test');
    expect(signWebhookBody(body, 'whsec_other')).not.toBe(signature);
    expect(signWebhookBody(`${body} `, 'whsec_test')).not.toBe(signature);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts the right signature and nothing else', () => {
    const signature = signWebhookBody(body, 'whsec_test');
    expect(verifyWebhookSignature(body, 'whsec_test', signature)).toBe(true);
    expect(verifyWebhookSignature(body, 'whsec_other', signature)).toBe(false);
    expect(verifyWebhookSignature(body, 'whsec_test', 'sha256=00')).toBe(false);
    expect(verifyWebhookSignature(body.replace('café', 'cafe'), 'whsec_test', signature)).toBe(
      false,
    );
  });
});

describe('newWebhookSecret', () => {
  it('is long, random and recognisable', () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[\w-]{43}$/);
    expect(newWebhookSecret()).not.toBe(secret);
  });
});

describe('createSecretBox', () => {
  const box = createSecretBox('a-jwt-secret-of-at-least-thirty-two-chars');

  it('gets the secret back, without storing it in the clear', () => {
    const sealed = box.encrypt('whsec_abc');
    expect(sealed).not.toContain('whsec_abc');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(box.decrypt(sealed)).toBe('whsec_abc');
    // A fresh IV each time.
    expect(box.encrypt('whsec_abc')).not.toBe(sealed);
  });

  it('refuses values sealed with another key, or changed', () => {
    const sealed = box.encrypt('whsec_abc');
    expect(() =>
      createSecretBox('another-secret-of-at-least-thirty-two').decrypt(sealed),
    ).toThrow();
    const [version, iv, tag, ciphertext = ''] = sealed.split('.');
    const changed = `${ciphertext.startsWith('A') ? 'B' : 'A'}${ciphertext.slice(1)}`;
    const flipped = `${version}.${iv}.${tag}.${changed}`;
    expect(() => box.decrypt(flipped)).toThrow();
    expect(() => box.decrypt('whsec_abc')).toThrow('Not a sealed webhook secret');
  });
});

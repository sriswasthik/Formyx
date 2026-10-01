import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createCloudinaryStorage,
  createUploadStorage,
  parseCloudinaryUrl,
  signCloudinaryParams,
} from './upload-storage.js';

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

describe('signCloudinaryParams', () => {
  it('signs the parameters sorted by name, joined with &, with the secret appended (SHA-1)', () => {
    const signature = signCloudinaryParams(
      { timestamp: 1_700_000_000, folder: 'formyx/forms/f1/q1', allowed_formats: 'pdf,png' },
      'secret',
    );
    expect(signature).toBe(
      sha1('allowed_formats=pdf,png&folder=formyx/forms/f1/q1&timestamp=1700000000secret'),
    );
  });

  it('leaves out what Cloudinary does not sign, and empty values', () => {
    const signature = signCloudinaryParams(
      { timestamp: 1, api_key: 'key', file: 'x', cloud_name: 'c', resource_type: 'raw', tags: '' },
      'secret',
    );
    expect(signature).toBe(sha1('timestamp=1secret'));
  });
});

describe('parseCloudinaryUrl', () => {
  it.each([
    [
      'an image, without its extension',
      'https://res.cloudinary.com/demo/image/upload/v1700000000/formyx/themes/f1/abc.png',
      { resourceType: 'image', publicId: 'formyx/themes/f1/abc' },
    ],
    [
      'a raw file, keeping its extension',
      'https://res.cloudinary.com/demo/raw/upload/v12/formyx/forms/f1/q1/x_cv.pdf',
      { resourceType: 'raw', publicId: 'formyx/forms/f1/q1/x_cv.pdf' },
    ],
    [
      'a URL without a version',
      'https://res.cloudinary.com/demo/video/upload/formyx/forms/f1/q1/clip.mp4',
      { resourceType: 'video', publicId: 'formyx/forms/f1/q1/clip' },
    ],
  ])('reads %s', (_case, url, expected) => {
    expect(parseCloudinaryUrl(url, 'demo')).toEqual(expected);
  });

  it.each([
    ['another account', 'https://res.cloudinary.com/other/image/upload/v1/formyx/a.png'],
    ['another host', 'https://evil.example/demo/image/upload/v1/formyx/a.png'],
    ['plain http', 'http://res.cloudinary.com/demo/image/upload/v1/formyx/a.png'],
    ['a private delivery type', 'https://res.cloudinary.com/demo/image/private/v1/formyx/a.png'],
    ['an unknown resource type', 'https://res.cloudinary.com/demo/script/upload/v1/formyx/a.js'],
    ['nothing after the version', 'https://res.cloudinary.com/demo/raw/upload/v1'],
    ['not a URL', 'formyx/forms/a.pdf'],
  ])('refuses %s', (_case, url) => {
    expect(parseCloudinaryUrl(url, 'demo')).toBeNull();
  });
});

describe('parseCloudinaryUrl and climbing paths', () => {
  it('reads where a path with .. really points, so the folder check judges that', () => {
    expect(
      parseCloudinaryUrl(
        'https://res.cloudinary.com/demo/raw/upload/v1/formyx/forms/f1/../../../other/a.pdf',
        'demo',
      ),
    ).toEqual({ resourceType: 'raw', publicId: 'other/a.pdf' });
    expect(
      parseCloudinaryUrl(
        'https://res.cloudinary.com/demo/raw/upload/v1/formyx/%2e%2e/a.pdf',
        'demo',
      )?.publicId,
    ).toBe('a.pdf');
  });
});

describe('createCloudinaryStorage', () => {
  it('signs an upload that pins the folder and the formats', () => {
    const storage = createCloudinaryStorage({
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      now: () => 1_700_000_000_123,
    });

    const signed = storage.signUpload({
      folder: 'formyx/forms/f1/q1',
      allowedFormats: ['pdf', 'png'],
      maxBytes: 1024,
    });

    expect(signed).toEqual({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/auto/upload',
      apiKey: 'key',
      timestamp: 1_700_000_000,
      folder: 'formyx/forms/f1/q1',
      allowedFormats: 'pdf,png',
      maxBytes: 1024,
      signature: signCloudinaryParams(
        { folder: 'formyx/forms/f1/q1', allowed_formats: 'pdf,png', timestamp: 1_700_000_000 },
        'secret',
      ),
    });
  });

  it('asks the Admin API about a file, authenticated, and treats 404 as missing', async () => {
    const requests: { url: string; authorization: string | null }[] = [];
    const storage = createCloudinaryStorage({
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        requests.push({
          url,
          authorization: new Headers(init?.headers).get('Authorization'),
        });
        return Promise.resolve(
          url.includes('missing')
            ? new Response('{}', { status: 404 })
            : Response.json({
                public_id: 'formyx/a',
                bytes: 2048,
                format: 'png',
                secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/formyx/a.png',
              }),
        );
      },
    });

    expect(
      await storage.describe('https://res.cloudinary.com/demo/image/upload/v1/formyx/a.png'),
    ).toEqual({
      publicId: 'formyx/a',
      bytes: 2048,
      format: 'png',
      secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/formyx/a.png',
    });
    expect(
      await storage.describe('https://res.cloudinary.com/demo/raw/upload/v1/formyx/missing.pdf'),
    ).toBeNull();
    expect(await storage.describe('https://elsewhere.example/a.png')).toBeNull();

    expect(requests[0]).toEqual({
      url: 'https://api.cloudinary.com/v1_1/demo/resources/image/upload/formyx/a',
      authorization: `Basic ${Buffer.from('key:secret').toString('base64')}`,
    });
    // The foreign URL never reached Cloudinary.
    expect(requests).toHaveLength(2);
  });
});

describe('createUploadStorage', () => {
  it('needs the whole account to switch uploads on', () => {
    expect(
      createUploadStorage({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: undefined,
      }),
    ).toBeNull();
    expect(
      createUploadStorage({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    ).not.toBeNull();
  });
});

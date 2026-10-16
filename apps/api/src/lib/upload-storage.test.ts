import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createCloudinaryStorage,
  createUploadStorage,
  fileLink,
  locationOfFile,
  parseCloudinaryUrl,
  parseFileLink,
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
      {
        resourceType: 'image',
        deliveryType: 'upload',
        publicId: 'formyx/themes/f1/abc',
        format: 'png',
      },
    ],
    [
      'a raw file, keeping its extension',
      'https://res.cloudinary.com/demo/raw/upload/v12/formyx/forms/f1/q1/x_cv.pdf',
      { resourceType: 'raw', deliveryType: 'upload', publicId: 'formyx/forms/f1/q1/x_cv.pdf' },
    ],
    [
      'a URL without a version',
      'https://res.cloudinary.com/demo/video/upload/formyx/forms/f1/q1/clip.mp4',
      {
        resourceType: 'video',
        deliveryType: 'upload',
        publicId: 'formyx/forms/f1/q1/clip',
        format: 'mp4',
      },
    ],
    [
      'a private file, past its signature',
      'https://res.cloudinary.com/demo/raw/private/s--Ab12_x-y--/v3/formyx/forms/f1/q1/x_cv.pdf',
      { resourceType: 'raw', deliveryType: 'private', publicId: 'formyx/forms/f1/q1/x_cv.pdf' },
    ],
  ])('reads %s', (_case, url, expected) => {
    expect(parseCloudinaryUrl(url, 'demo')).toEqual(expected);
  });

  it.each([
    ['another account', 'https://res.cloudinary.com/other/image/upload/v1/formyx/a.png'],
    ['another host', 'https://evil.example/demo/image/upload/v1/formyx/a.png'],
    ['plain http', 'http://res.cloudinary.com/demo/image/upload/v1/formyx/a.png'],
    ['another delivery type', 'https://res.cloudinary.com/demo/image/fetch/v1/formyx/a.png'],
    ['an unknown resource type', 'https://res.cloudinary.com/demo/script/upload/v1/formyx/a.js'],
    ['nothing after the version', 'https://res.cloudinary.com/demo/raw/upload/v1'],
    ['not a URL', 'formyx/forms/a.pdf'],
  ])('refuses %s', (_case, url) => {
    expect(parseCloudinaryUrl(url, 'demo')).toBeNull();
  });
});

describe('file links', () => {
  const location = {
    resourceType: 'image',
    deliveryType: 'private',
    publicId: 'formyx/forms/f1/q1/abc',
    format: 'png',
  } as const;

  it('stand for a private file, and read back', () => {
    const link = fileLink('https://formyx.app', 'f1', location);
    expect(link).toBe(
      'https://formyx.app/api/forms/f1/files/image/formyx%2Fforms%2Ff1%2Fq1%2Fabc.png',
    );
    expect(parseFileLink(link, 'https://formyx.app')).toEqual({ formId: 'f1', location });
    // Raw files keep their extension in the id.
    const raw = {
      resourceType: 'raw',
      deliveryType: 'private',
      publicId: 'formyx/forms/f1/q1/x.pdf',
    } as const;
    expect(parseFileLink(fileLink('https://formyx.app', 'f1', raw), 'https://formyx.app')).toEqual({
      formId: 'f1',
      location: raw,
    });
  });

  it('refuse other sites, other shapes and climbing paths', () => {
    expect(
      parseFileLink('https://evil.example/api/forms/f1/files/raw/a.pdf', 'https://formyx.app'),
    ).toBeNull();
    expect(
      parseFileLink('https://formyx.app/api/forms/f1/files/script/a.js', 'https://formyx.app'),
    ).toBeNull();
    expect(locationOfFile('f1', 'raw', 'formyx/../secrets.pdf')).toBeNull();
    expect(locationOfFile('', 'raw', 'a.pdf')).toBeNull();
  });
});

describe('private files', () => {
  const storage = createCloudinaryStorage({
    cloudName: 'demo',
    apiKey: 'key',
    apiSecret: 'secret',
    now: () => 1_700_000_000_000,
  });

  it('are uploaded with a signed private type', () => {
    const signature = storage.signUpload({
      folder: 'formyx/forms/f1/q1',
      allowedFormats: ['pdf'],
      maxBytes: 10,
      private: true,
    });
    expect(signature.type).toBe('private');
    expect(signature.signature).toBe(
      sha1('allowed_formats=pdf&folder=formyx/forms/f1/q1&timestamp=1700000000&type=privatesecret'),
    );
  });

  it('are downloaded through signed links that expire', () => {
    const url = new URL(
      storage.downloadUrl(
        { resourceType: 'image', deliveryType: 'private', publicId: 'formyx/a', format: 'png' },
        300,
      ),
    );
    expect(url.origin + url.pathname).toBe('https://api.cloudinary.com/v1_1/demo/image/download');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      public_id: 'formyx/a',
      type: 'private',
      format: 'png',
      timestamp: '1700000000',
      expires_at: '1700000300',
      api_key: 'key',
      signature: sha1(
        'expires_at=1700000300&format=png&public_id=formyx/a&timestamp=1700000000&type=privatesecret',
      ),
    });
  });

  it('leave files that are still public at their delivery URLs', () => {
    expect(
      storage.downloadUrl(
        { resourceType: 'raw', deliveryType: 'upload', publicId: 'formyx/a.pdf' },
        300,
      ),
    ).toBe('https://res.cloudinary.com/demo/raw/upload/formyx/a.pdf');
  });
});

describe('parseCloudinaryUrl and climbing paths', () => {
  it('reads where a path with .. really points, so the folder check judges that', () => {
    expect(
      parseCloudinaryUrl(
        'https://res.cloudinary.com/demo/raw/upload/v1/formyx/forms/f1/../../../other/a.pdf',
        'demo',
      ),
    ).toEqual({ resourceType: 'raw', deliveryType: 'upload', publicId: 'other/a.pdf' });
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
      location: {
        resourceType: 'image',
        deliveryType: 'upload',
        publicId: 'formyx/a',
        format: 'png',
      },
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

  it('deletes files a resource type at a time, ignoring URLs that are not ours', async () => {
    const requests: { url: string; method: string | undefined }[] = [];
    const storage = createCloudinaryStorage({
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: (input, init) => {
        requests.push({
          url: input instanceof Request ? input.url : input.toString(),
          method: init?.method,
        });
        return Promise.resolve(Response.json({ deleted: {} }));
      },
    });

    await storage.deleteFiles([
      'https://res.cloudinary.com/demo/image/upload/v1/formyx/a.png',
      'https://res.cloudinary.com/demo/raw/upload/v1/formyx/b.pdf',
      'https://res.cloudinary.com/demo/image/upload/v2/formyx/c.jpg',
      'https://elsewhere.example/d.png',
    ]);

    expect(requests).toEqual([
      {
        url: 'https://api.cloudinary.com/v1_1/demo/resources/image/upload?public_ids%5B%5D=formyx%2Fa&public_ids%5B%5D=formyx%2Fc',
        method: 'DELETE',
      },
      {
        url: 'https://api.cloudinary.com/v1_1/demo/resources/raw/upload?public_ids%5B%5D=formyx%2Fb.pdf',
        method: 'DELETE',
      },
    ]);
  });

  it('says so when Cloudinary refuses to delete', async () => {
    const storage = createCloudinaryStorage({
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: () => Promise.resolve(new Response('{}', { status: 500 })),
    });
    await expect(
      storage.deleteFiles(['https://res.cloudinary.com/demo/image/upload/v1/formyx/a.png']),
    ).rejects.toThrow('Cloudinary refused to delete files (500)');
  });
});

describe('createUploadStorage', () => {
  it('needs the whole account to switch uploads on', () => {
    expect(
      createUploadStorage({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: undefined,
        CLOUDINARY_API_URL: 'https://api.cloudinary.com',
        APP_URL: 'https://formyx.app',
      }),
    ).toBeNull();
    expect(
      createUploadStorage({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
        CLOUDINARY_API_URL: 'https://api.cloudinary.com',
        APP_URL: 'https://formyx.app',
      }),
    ).not.toBeNull();
  });
});

import { apiErrorSchema, healthResponseSchema } from '@formyx/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './test/create-test-app.js';

const app = createTestApp({ CORS_ORIGIN: 'http://localhost:5173' });

describe('GET /api/health', () => {
  it('returns ok with the shared health shape', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(healthResponseSchema.parse(res.body).status).toBe('ok');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('request ids', () => {
  it('generates an X-Request-Id when none is sent', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming X-Request-Id', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'lb-trace_123');
    expect(res.headers['x-request-id']).toBe('lb-trace_123');
  });

  it('replaces a malformed incoming X-Request-Id', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'bad id\twith spaces');
    expect(res.headers['x-request-id']).not.toBe('bad id\twith spaces');
  });
});

describe('CORS', () => {
  it('allows configured origins with credentials', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error responses', () => {
  it('returns NOT_FOUND in the standard shape for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);

    expect(apiErrorSchema.parse(res.body)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found: GET /api/does-not-exist' },
    });
  });

  it('returns BAD_REQUEST for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(res.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' },
    });
  });

  it('returns PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const res = await request(app)
      .post('/api/health')
      .send({ blob: 'x'.repeat(200 * 1024) })
      .expect(413);

    expect(apiErrorSchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

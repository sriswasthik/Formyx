import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../lib/app-error.js';
import { errorHandler, toErrorResponse } from './error-handler.js';

function httpError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

describe('toErrorResponse', () => {
  it('maps AppError to its own status, code, message and details', () => {
    const error = new AppError(409, 'CONFLICT', 'Slug already taken', { details: { slug: 'x' } });

    expect(toErrorResponse(error)).toEqual({
      status: 409,
      body: { error: { code: 'CONFLICT', message: 'Slug already taken', details: { slug: 'x' } } },
    });
  });

  it('maps ZodError to VALIDATION_ERROR with flattened issues', () => {
    const result = z.object({ email: z.email('Enter a valid email') }).safeParse({ email: 'nope' });
    if (result.success) throw new Error('expected failure');

    expect(toErrorResponse(result.error)).toEqual({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ path: 'email', message: 'Enter a valid email' }],
        },
      },
    });
  });

  it('maps exposed 4xx http errors using their status', () => {
    expect(toErrorResponse(httpError(429, 'Slow down', { expose: true }))).toEqual({
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Slow down' } },
    });
  });

  it('never leaks internal error messages', () => {
    const cases = [
      new Error('connect ECONNREFUSED 10.0.0.3:5432'),
      httpError(502, 'upstream exploded', { expose: false }),
      httpError(400, 'internal detail', { expose: false }),
      'a thrown string',
      undefined,
    ];

    for (const error of cases) {
      expect(toErrorResponse(error)).toEqual({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
      });
    }
  });
});

describe('errorHandler', () => {
  const app = express();
  app.get('/app-error', () => {
    throw new AppError(403, 'FORBIDDEN', 'Not your form');
  });
  app.get('/async-crash', async () => {
    await Promise.resolve();
    throw new Error('database password is hunter2');
  });
  app.use(errorHandler);

  it('responds with the standard shape for thrown AppErrors', async () => {
    const res = await request(app).get('/app-error').expect(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Not your form' } });
  });

  it('handles rejected async handlers without leaking details', async () => {
    const res = await request(app).get('/async-crash').expect(500);

    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});

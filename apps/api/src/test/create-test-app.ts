import { pino } from 'pino';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';

export function createTestApp(env: Record<string, string> = {}) {
  return createApp({
    env: parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }),
    logger: pino({ level: 'silent' }),
  });
}

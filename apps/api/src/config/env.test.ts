import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGIN: ['http://localhost:5173'],
      LOG_LEVEL: 'info',
    });
  });

  it('coerces PORT and parses a comma-separated, normalised origin list', () => {
    const env = parseEnv({
      PORT: '8080',
      CORS_ORIGIN: 'https://formyx.app/, https://www.formyx.app ,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGIN).toEqual(['https://formyx.app', 'https://www.formyx.app']);
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    [{ CORS_ORIGIN: 'not a url' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'ftp://files.example' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: ' , ' }, 'CORS_ORIGIN'],
  ])('rejects %j and names the variable', (source, variable) => {
    expect(() => parseEnv(source)).toThrow(EnvError);
    expect(() => parseEnv(source)).toThrow(variable);
  });
});

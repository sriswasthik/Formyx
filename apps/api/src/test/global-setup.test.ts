import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from './global-setup.js';

describe('resolveTestDatabaseUrl', () => {
  it('defaults to the local formyx_test database', () => {
    expect(resolveTestDatabaseUrl({})).toBe(
      'postgresql://formyx:formyx@localhost:5432/formyx_test',
    );
  });

  it('uses TEST_DATABASE_URL when it names a _test database', () => {
    const url = 'postgresql://ci:ci@db:5432/app_test?sslmode=disable';
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('refuses databases that are not clearly disposable', () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://u:p@localhost:5432/formyx' }),
    ).toThrow(/Refusing to run tests against the database "formyx"/);
  });
});

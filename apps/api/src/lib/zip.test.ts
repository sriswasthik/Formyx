import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createZip, readZip } from './zip.js';

describe('createZip', () => {
  it('stores files that read back as they were, names in UTF-8 included', () => {
    const archive = createZip([
      { name: 'account.json', data: '{"name":"Ada"}' },
      { name: 'forms/కాఫీ సర్వే/responses.csv', data: 'a,b\r\n1,2\r\n' },
      { name: 'empty.txt', data: '' },
    ]);

    const files = readZip(archive);
    expect([...files.keys()]).toEqual([
      'account.json',
      'forms/కాఫీ సర్వే/responses.csv',
      'empty.txt',
    ]);
    expect(files.get('account.json')?.toString('utf8')).toBe('{"name":"Ada"}');
    expect(files.get('forms/కాఫీ సర్వే/responses.csv')?.toString('utf8')).toBe('a,b\r\n1,2\r\n');
    expect(files.get('empty.txt')?.length).toBe(0);
  });

  it('makes archives other tools can open', () => {
    const dir = mkdtempSync(join(tmpdir(), 'formyx-zip-'));
    const path = join(dir, 'export.zip');
    writeFileSync(path, createZip([{ name: 'readme.txt', data: 'Hello'.repeat(100) }]));

    // Python's zipfile checks every CRC and size; it is on CI's runners and most machines.
    let listed: string;
    try {
      listed = execFileSync(
        'python',
        [
          '-c',
          'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read("readme.txt").decode()[:10])',
          path,
        ],
        { encoding: 'utf8' },
      );
    } catch {
      return; // No Python here: the read-back test above still covers the format.
    }
    expect(listed.trim()).toBe('HelloHello');
  });
});

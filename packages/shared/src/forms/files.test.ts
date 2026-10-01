import { describe, expect, it } from 'vitest';
import {
  allowedExtensions,
  BYTES_PER_MB,
  fileExtension,
  fileProblem,
  formatFileSize,
  isFileAnswer,
} from './files.js';

describe('fileExtension', () => {
  it.each([
    ['report.pdf', 'pdf'],
    ['Report.Final.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['README', ''],
    ['.env', ''],
    ['trailing.', ''],
  ])('%s -> %j', (name, expected) => {
    expect(fileExtension(name)).toBe(expected);
  });
});

describe('allowedExtensions', () => {
  it('joins the categories without repeats', () => {
    expect(allowedExtensions(['pdf', 'spreadsheet'])).toEqual(['pdf', 'xls', 'xlsx', 'ods', 'csv']);
  });
});

describe('fileProblem', () => {
  const config = { maxSizeMb: 5, allowedTypes: ['image', 'pdf'] as const };

  it('accepts files of an allowed type within the limit', () => {
    expect(fileProblem({ name: 'photo.JPG', size: 5 * BYTES_PER_MB }, config)).toBeNull();
    expect(fileProblem({ name: 'cv.pdf', size: 1 }, config)).toBeNull();
  });

  it('refuses other types, judged by extension', () => {
    expect(fileProblem({ name: 'notes.docx', size: 10 }, config)).toBe(
      'This type of file isn’t accepted here',
    );
    expect(fileProblem({ name: 'no-extension', size: 10 }, config)).toBe(
      'This type of file isn’t accepted here',
    );
  });

  it('refuses files over the limit, and empty ones', () => {
    expect(fileProblem({ name: 'big.png', size: 5 * BYTES_PER_MB + 1 }, config)).toBe(
      'This file is too big. The limit is 5 MB',
    );
    expect(fileProblem({ name: 'empty.png', size: 0 }, config)).toBe('This file is empty');
  });
});

describe('isFileAnswer', () => {
  it('recognises uploaded files, not file names', () => {
    expect(
      isFileAnswer({
        url: 'https://res.cloudinary.com/demo/image/upload/v1/a.png',
        publicId: 'a',
        name: 'a.png',
        size: 10,
        type: 'image/png',
      }),
    ).toBe(true);
    expect(isFileAnswer('a.png')).toBe(false);
    expect(isFileAnswer({ name: 'a.png' })).toBe(false);
  });
});

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [1.5 * BYTES_PER_MB, '1.5 MB'],
    [24 * BYTES_PER_MB, '24 MB'],
  ])('%i bytes -> %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

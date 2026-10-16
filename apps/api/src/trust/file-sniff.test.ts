import { describe, expect, it } from 'vitest';
import { sniffProblem } from './file-sniff.js';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? Array.from(part, (character) => character.charCodeAt(0)) : part,
    ),
  );

const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

describe('sniffProblem', () => {
  it.each([
    ['pdf', bytes('%PDF-1.7 rest of the file')],
    ['pdf', bytes('   junk before %PDF-1.4')],
    ['docx', bytes(ZIP)],
    ['xlsx', bytes(ZIP)],
    ['zip', bytes(ZIP)],
    ['doc', bytes(OLE)],
    ['rtf', bytes(String.fromCharCode(123, 92), 'rtf1 hello')],
    ['txt', bytes('Plain notes, line one')],
    ['csv', bytes('name,email', [10], 'Ada,ada@example.com')],
    ['7z', bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
    ['gz', bytes([0x1f, 0x8b, 0x08])],
    ['tar', bytes(new Array<number>(257).fill(0), 'ustar')],
    // Images, audio and video: Cloudinary checks those itself.
    ['png', bytes('anything at all')],
  ])('lets a real .%s through', (extension, head) => {
    expect(sniffProblem(extension, head)).toBeNull();
  });

  it.each([
    ['a Windows program', 'pdf', bytes('MZ', [0x90, 0])],
    ['a Linux program', 'docx', bytes([0x7f], 'ELF', [2, 1])],
    ['a Mac program', 'zip', bytes([0xcf, 0xfa, 0xed, 0xfe])],
    ['a script', 'txt', bytes('#!/bin/sh', [10], 'rm -rf ~')],
  ])('refuses %s, whatever it is called', (name, extension, head) => {
    expect(sniffProblem(extension, head)).toBe(`This file is ${name}, which can’t be uploaded`);
  });

  it.each([
    ['pdf', bytes('Just text pretending')],
    ['docx', bytes(OLE)],
    ['doc', bytes(ZIP)],
    ['txt', bytes('text', [0], 'binary')],
    ['txt', bytes('  <!DOCTYPE html><script>alert(1)</script>')],
    ['csv', bytes('<svg onload="alert(1)">')],
  ])('refuses a .%s that is something else', (extension, head) => {
    expect(sniffProblem(extension, head)).toBe(`This file isn’t really a .${extension} file`);
  });

  it('leaves an empty read to the size checks', () => {
    expect(sniffProblem('pdf', new Uint8Array())).toBeNull();
  });
});

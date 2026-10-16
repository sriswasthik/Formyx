/*
 * What a file really is, from its first bytes rather than its name. Cloudinary works out the
 * format of images, audio and video from their content; for everything else it goes by the
 * extension, so a program renamed "report.pdf" would get through. These checks run on those
 * files before they are accepted. Executables and scripts are refused whatever they're called.
 */

/** How many bytes the checks read (tar's marker sits at byte 257). */
export const SNIFF_BYTES = 512;

const startsWith = (head: Uint8Array, signature: readonly number[], offset = 0) =>
  head.length >= offset + signature.length &&
  signature.every((byte, index) => head[offset + index] === byte);

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

/** Programs and scripts: never accepted. */
const EXECUTABLES: { name: string; matches: (head: Uint8Array) => boolean }[] = [
  { name: 'a Windows program', matches: (head) => startsWith(head, ascii('MZ')) },
  { name: 'a Linux program', matches: (head) => startsWith(head, [0x7f, ...ascii('ELF')]) },
  {
    name: 'a Mac program',
    matches: (head) =>
      [
        [0xfe, 0xed, 0xfa, 0xce],
        [0xfe, 0xed, 0xfa, 0xcf],
        [0xce, 0xfa, 0xed, 0xfe],
        [0xcf, 0xfa, 0xed, 0xfe],
        [0xca, 0xfe, 0xba, 0xbe],
      ].some((signature) => startsWith(head, signature)),
  },
  { name: 'a script', matches: (head) => startsWith(head, ascii('#!')) },
];

/** What a file's first text says, lowercased, without a byte-order mark or leading space. */
function leadingText(head: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false })
    .decode(head.subarray(0, 256))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
}

const MARKUP = /^(?:<!doctype html|<html|<script|<svg|<\?php|<\?xml[^>]*>\s*<svg)/;

const isText = (head: Uint8Array) => !head.includes(0);

const ZIP = (head: Uint8Array) =>
  startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]);
const OLE = (head: Uint8Array) =>
  startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** What each non-media extension's content must look like. */
const EXPECTED: Record<string, (head: Uint8Array) => boolean> = {
  // Some PDFs carry a little junk before the marker; readers look a short way in.
  pdf: (head) => indexOf(head, ascii('%PDF-')) >= 0,
  docx: ZIP,
  xlsx: ZIP,
  pptx: ZIP,
  odt: ZIP,
  ods: ZIP,
  odp: ZIP,
  key: ZIP,
  zip: ZIP,
  doc: OLE,
  xls: OLE,
  ppt: OLE,
  rtf: (head) => startsWith(head, ascii('{\\rtf')),
  rar: (head) => startsWith(head, ascii('Rar!')),
  '7z': (head) => startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  gz: (head) => startsWith(head, [0x1f, 0x8b]),
  tar: (head) => startsWith(head, ascii('ustar'), 257),
  txt: (head) => isText(head) && !MARKUP.test(leadingText(head)),
  csv: (head) => isText(head) && !MARKUP.test(leadingText(head)),
};

function indexOf(head: Uint8Array, needle: readonly number[]): number {
  for (let start = 0; start + needle.length <= Math.min(head.length, 1024); start++) {
    if (needle.every((byte, index) => head[start + index] === byte)) return start;
  }
  return -1;
}

/**
 * Why a file with `extension` and these first bytes is refused, or `null` if it may stay.
 * Extensions not listed here (images, audio, video) are left to Cloudinary's own checks.
 */
export function sniffProblem(extension: string, head: Uint8Array): string | null {
  const executable = EXECUTABLES.find(({ matches }) => matches(head));
  if (executable) return `This file is ${executable.name}, which can’t be uploaded`;
  const expected = EXPECTED[extension.toLowerCase()];
  if (expected && head.length > 0 && !expected(head)) {
    return `This file isn’t really a .${extension.toLowerCase()} file`;
  }
  return null;
}

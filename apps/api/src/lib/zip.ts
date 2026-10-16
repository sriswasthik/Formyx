import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/*
 * A small ZIP writer for data exports: files are deflated, named in UTF-8, and dated when the
 * archive is made. Enough for what exports hold (JSON and CSV, well under ZIP64’s limits);
 * `readZip` reads them back, for tests.
 */

export interface ZipEntry {
  /** Path inside the archive, with forward slashes: `forms/survey/responses.csv`. */
  name: string;
  data: string | Uint8Array;
}

/** ZIP's MS-DOS time and date. */
function dosDateTime(date: Date): { time: number; day: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

/** Bit 11: names are UTF-8. */
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;

export function createZip(entries: readonly ZipEntry[], now: Date = new Date()): Buffer {
  const { time, day } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw =
      typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : Buffer.from(entry.data);
    const packed = deflateRawSync(raw);
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Reads back what `createZip` wrote (for tests and checks): name to contents. */
export function readZip(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const endAt = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('Not a ZIP archive');
  const count = archive.readUInt16LE(endAt + 10);
  let at = archive.readUInt32LE(endAt + 16);
  for (let index = 0; index < count; index += 1) {
    const packedSize = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);
    const localNameLength = archive.readUInt16LE(localAt + 26);
    const localExtraLength = archive.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;
    files.set(name, inflateRawSync(archive.subarray(dataAt, dataAt + packedSize)));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

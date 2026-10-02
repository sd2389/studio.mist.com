import { deflateSync } from "fflate";

/**
 * Incremental ZIP builder. Media (JPG/PNG/MP4 — already compressed) is stored; text is
 * deflated. Every local header carries the real CRC and sizes (no data descriptors), which
 * keeps the archive readable by strict and streaming unzippers alike. Entries are kept as
 * Blob parts, so a multi-hundred-MB pack never has to live in the JS heap twice.
 */

type ZipEntry = {
  path: string;
  nameBytes: Uint8Array;
  crc: number;
  compressedSize: number;
  size: number;
  method: 0 | 8;
  offset: number;
};

export type ZipWriterEntry = { path: string; bytes: number; compressed: boolean };

const UTF8_FLAG = 0x0800;
const MAX_ZIP32 = 0xffffffff;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(data: Uint8Array, seed = 0): number {
  const table = getCrcTable();
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function isAscii(value: string): boolean {
  return [...value].every((char) => char.charCodeAt(0) < 0x80);
}

async function toBytes(data: Blob | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

export class PackZipWriter {
  private readonly parts: (Blob | Uint8Array)[] = [];
  private readonly entries: ZipEntry[] = [];
  private readonly paths = new Set<string>();
  private readonly stamp: { time: number; date: number };
  private offset = 0;
  private finished = false;

  constructor(modifiedAt: Date = new Date()) {
    this.stamp = dosDateTime(modifiedAt);
  }

  get files(): ZipWriterEntry[] {
    return this.entries.map((entry) => ({
      path: entry.path,
      bytes: entry.size,
      compressed: entry.method === 8,
    }));
  }

  has(path: string): boolean {
    return this.paths.has(path);
  }

  /** Adds one file. `compress` deflates it (use for text; media is already compressed). */
  async add(path: string, data: Blob | Uint8Array | string, opts: { compress?: boolean } = {}): Promise<number> {
    if (this.finished) throw new Error("ZIP already finished");
    if (this.paths.has(path)) throw new Error(`Duplicate ZIP entry: ${path}`);
    if (this.entries.length >= 0xffff) throw new Error("Too many files for one ZIP archive");
    const raw = await toBytes(data);
    const method: 0 | 8 = opts.compress ? 8 : 0;
    const payload = method === 8 ? deflateSync(raw, { level: 6 }) : raw;
    const nameBytes = new TextEncoder().encode(path);
    const entry: ZipEntry = {
      path,
      nameBytes,
      crc: crc32(raw),
      compressedSize: payload.byteLength,
      size: raw.byteLength,
      method,
      offset: this.offset,
    };
    const header = this.header(entry, false);
    if (this.offset + header.byteLength + payload.byteLength > MAX_ZIP32) {
      throw new Error("Campaign pack exceeds the 4 GB ZIP limit — choose fewer or smaller outputs.");
    }
    this.paths.add(path);
    this.entries.push(entry);
    // Keep the caller's Blob as the part when storing, so bytes stay out of the JS heap.
    this.parts.push(header, method === 0 && data instanceof Blob ? data : payload);
    this.offset += header.byteLength + payload.byteLength;
    return raw.byteLength;
  }

  finish(): Blob {
    if (this.finished) throw new Error("ZIP already finished");
    this.finished = true;
    const central = this.entries.map((entry) => this.header(entry, true));
    const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...central, end] as BlobPart[], { type: "application/zip" });
  }

  private header(entry: ZipEntry, central: boolean): Uint8Array {
    const fixed = central ? 46 : 30;
    const out = new Uint8Array(fixed + entry.nameBytes.byteLength);
    const view = new DataView(out.buffer);
    const flags = isAscii(entry.path) ? 0 : UTF8_FLAG;
    let at = 0;
    view.setUint32(at, central ? 0x02014b50 : 0x04034b50, true);
    at += 4;
    if (central) {
      view.setUint16(at, 20, true);
      at += 2;
    }
    view.setUint16(at, 20, true);
    view.setUint16(at + 2, flags, true);
    view.setUint16(at + 4, entry.method, true);
    view.setUint16(at + 6, this.stamp.time, true);
    view.setUint16(at + 8, this.stamp.date, true);
    view.setUint32(at + 10, entry.crc, true);
    view.setUint32(at + 14, entry.compressedSize, true);
    view.setUint32(at + 18, entry.size, true);
    view.setUint16(at + 22, entry.nameBytes.byteLength, true);
    // Extra, comment, disk, attributes stay zero.
    if (central) view.setUint32(42, entry.offset, true);
    out.set(entry.nameBytes, fixed);
    return out;
  }
}

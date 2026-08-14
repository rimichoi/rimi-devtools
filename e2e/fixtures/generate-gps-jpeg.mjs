// e2e/fixtures/generate-gps-jpeg.mjs
//
// Regenerates e2e/fixtures/gps-sample.jpg — a minimal, hand-packed JPEG that
// contains nothing but an EXIF APP1 segment with a GPS IFD (no pixel data,
// no other segments). Used by e2e/exif-gps.spec.ts to prove the GPS warning
// banner in src/tools/exif/index.ts actually renders for a real file parsed
// by the real exifr library, not just for hand-built objects in unit tests.
//
// Pure Node, zero dependencies. This repo's runtime dependency cap
// (sql-formatter / jsondiffpatch / exifr) is already spent, and this script
// must not need any of them — or anything else — to run.
//
// Run: node e2e/fixtures/generate-gps-jpeg.mjs
//
// Fixture coordinates: 37° 33' 59.4" N, 126° 58' 40.8" E
//   -> lat 37.5665, lon 126.978
// (chosen to match the values already exercised by
//  src/tools/exif/logic.test.ts's formatCoordinate cases)
//
// Byte layout follows the standard TIFF6 / EXIF 2.3 structure documented at
// the top of node_modules/exifr/src/segment-parsers/tiff-exif.mjs:
//   FF D8                              SOI
//   FF E1 <len> "Exif\0\0" <TIFF ...>  APP1 (the EXIF container)
//   FF D9                              EOI
// and within <TIFF ...>: TIFF header -> IFD0 (one entry: GPS IFD pointer)
// -> GPS IFD (LatRef/Lat/LonRef/Lon) -> the two DMS rational triplets.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'gps-sample.jpg');

// ---- TIFF tag & data-type constants (TIFF6 spec / EXIF 2.3 GPS IFD) ----
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

const TAG_GPS_IFD_POINTER = 0x8825; // IFD0 entry that points at the GPS IFD
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

// ---- layout: every offset below is relative to the TIFF header's first byte ----
const TIFF_HEADER_SIZE = 8; // 'II' (2) + 0x002A (2) + ifd0-offset (4)
const IFD0_OFFSET = TIFF_HEADER_SIZE;
const IFD0_ENTRY_COUNT = 1; // just the GPS IFD pointer
const IFD0_SIZE = 2 + IFD0_ENTRY_COUNT * 12 + 4; // entry-count + entries + next-ifd-offset

const GPS_IFD_OFFSET = IFD0_OFFSET + IFD0_SIZE;
const GPS_IFD_ENTRY_COUNT = 4; // LatRef, Lat, LonRef, Lon
const GPS_IFD_SIZE = 2 + GPS_IFD_ENTRY_COUNT * 12 + 4;

const GPS_LAT_RATIONALS_OFFSET = GPS_IFD_OFFSET + GPS_IFD_SIZE;
const GPS_LON_RATIONALS_OFFSET = GPS_LAT_RATIONALS_OFFSET + 3 * 8; // 3 rationals x 8 bytes

const TIFF_TOTAL_SIZE = GPS_LON_RATIONALS_OFFSET + 3 * 8;

function writeIfdEntry(buf, offset, tag, type, count, valueOrOffset) {
  buf.writeUInt16LE(tag, offset);
  buf.writeUInt16LE(type, offset + 2);
  buf.writeUInt32LE(count, offset + 4);
  buf.writeUInt32LE(valueOrOffset, offset + 8);
}

// A single-ASCII-char value ("N", "E", ...) fits inline (1 char + NUL <= 4 bytes).
// `count` per the TIFF spec includes the trailing NUL.
function writeAsciiRefEntry(buf, offset, tag, asciiChar) {
  buf.writeUInt16LE(tag, offset);
  buf.writeUInt16LE(TYPE_ASCII, offset + 2);
  buf.writeUInt32LE(2, offset + 4); // 1 char + NUL terminator
  buf.write(asciiChar, offset + 8, 'ascii');
  buf.writeUInt8(0, offset + 9);
  return offset + 12;
}

function writeRationalRefEntry(buf, offset, tag, count, dataOffset) {
  writeIfdEntry(buf, offset, tag, TYPE_RATIONAL, count, dataOffset);
  return offset + 12;
}

function writeRational(buf, offset, numerator, denominator) {
  buf.writeUInt32LE(numerator, offset);
  buf.writeUInt32LE(denominator, offset + 4);
}

const tiff = Buffer.alloc(TIFF_TOTAL_SIZE);

// TIFF header: little-endian byte order marker 'II', magic 42, IFD0 offset.
tiff.write('II', 0, 'ascii');
tiff.writeUInt16LE(0x002a, 2);
tiff.writeUInt32LE(IFD0_OFFSET, 4);

// IFD0: exactly one entry, a LONG pointing at the GPS IFD, then no next IFD.
tiff.writeUInt16LE(IFD0_ENTRY_COUNT, IFD0_OFFSET);
writeIfdEntry(tiff, IFD0_OFFSET + 2, TAG_GPS_IFD_POINTER, TYPE_LONG, 1, GPS_IFD_OFFSET);
tiff.writeUInt32LE(0, IFD0_OFFSET + 2 + IFD0_ENTRY_COUNT * 12);

// GPS IFD: GPSLatitudeRef, GPSLatitude, GPSLongitudeRef, GPSLongitude, then no next IFD.
let p = GPS_IFD_OFFSET;
tiff.writeUInt16LE(GPS_IFD_ENTRY_COUNT, p);
p += 2;
p = writeAsciiRefEntry(tiff, p, TAG_GPS_LAT_REF, 'N');
p = writeRationalRefEntry(tiff, p, TAG_GPS_LAT, 3, GPS_LAT_RATIONALS_OFFSET);
p = writeAsciiRefEntry(tiff, p, TAG_GPS_LON_REF, 'E');
p = writeRationalRefEntry(tiff, p, TAG_GPS_LON, 3, GPS_LON_RATIONALS_OFFSET);
tiff.writeUInt32LE(0, p);

// GPS rationals: degrees / minutes / seconds, each as a numerator/denominator pair.
writeRational(tiff, GPS_LAT_RATIONALS_OFFSET + 0, 37, 1); // 37 deg
writeRational(tiff, GPS_LAT_RATIONALS_OFFSET + 8, 33, 1); // 33 min
writeRational(tiff, GPS_LAT_RATIONALS_OFFSET + 16, 594, 10); // 59.4 sec

writeRational(tiff, GPS_LON_RATIONALS_OFFSET + 0, 126, 1); // 126 deg
writeRational(tiff, GPS_LON_RATIONALS_OFFSET + 8, 58, 1); // 58 min
writeRational(tiff, GPS_LON_RATIONALS_OFFSET + 16, 408, 10); // 40.8 sec

// ---- wrap the TIFF/EXIF data in a minimal JPEG: SOI + APP1 + EOI ----
const exifHeader = Buffer.from('Exif\0\0', 'ascii'); // must be exactly 6 bytes
const app1Payload = Buffer.concat([exifHeader, tiff]);

const app1LengthBuf = Buffer.alloc(2);
app1LengthBuf.writeUInt16BE(app1Payload.length + 2, 0); // length field counts itself

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]), // SOI
  Buffer.from([0xff, 0xe1]), // APP1 marker
  app1LengthBuf,
  app1Payload,
  Buffer.from([0xff, 0xd9]), // EOI
]);

writeFileSync(OUT_PATH, jpeg);
console.log(`wrote ${jpeg.length} bytes -> ${OUT_PATH}`);

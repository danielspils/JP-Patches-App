#!/usr/bin/env node
// Regenerate build/icon.ico (the Windows app/installer icon) from the existing
// build/icon.png master. Produces a multi-resolution Vista+ ICO whose entries
// are PNG-compressed (16/32/48/64/128/256 px) — the format Windows shell and
// electron-builder's NSIS target expect.
//
// macOS-only (uses `sips` to resize, same host-tool approach as setup-vendor's
// tar/Expand-Archive). The output icon.ico is committed, so this only needs to
// run when icon.png changes.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'icon.png');
const OUT = path.join(ROOT, 'build', 'icon.ico');
const SIZES = [16, 32, 48, 64, 128, 256];

if (!fs.existsSync(SRC)) {
  console.error(`source not found: ${SRC}`);
  process.exit(1);
}

// Resize the master PNG to each size with sips, collect the PNG bytes.
const images = SIZES.map((size) => {
  const tmp = path.join(os.tmpdir(), `jp-icon-${size}.png`);
  execFileSync('sips', ['-z', String(size), String(size), SRC, '--out', tmp], { stdio: 'ignore' });
  const data = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch {}
  return { size, data };
});

// Assemble the ICO container: ICONDIR (6 bytes) + N×ICONDIRENTRY (16 bytes) +
// the PNG blobs.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);            // reserved
header.writeUInt16LE(1, 2);            // type 1 = icon
header.writeUInt16LE(images.length, 4); // image count

const entries = [];
const blobs = [];
let offset = 6 + images.length * 16;
for (const { size, data } of images) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 ⇒ 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 ⇒ 256)
  e.writeUInt8(0, 2);                       // palette count
  e.writeUInt8(0, 3);                       // reserved
  e.writeUInt16LE(1, 4);                    // color planes
  e.writeUInt16LE(32, 6);                   // bits per pixel
  e.writeUInt32LE(data.length, 8);          // bytes in resource
  e.writeUInt32LE(offset, 12);              // offset to image data
  entries.push(e);
  blobs.push(data);
  offset += data.length;
}

fs.writeFileSync(OUT, Buffer.concat([header, ...entries, ...blobs]));
console.log(`wrote ${OUT} (${SIZES.join('/')} px, ${fs.statSync(OUT).size} bytes)`);

// Gera build/icon.png (512x512) programaticamente — sem dependências externas.
// Ícone: fundo radial azul-escuro, orbe de energia ciano com brilho e um raio.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const S = 512;
const px = new Uint8Array(S * S * 4);

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Raio (relâmpago) no centro
const bolt = [
  [256, 120], [212, 252], [250, 252], [222, 392],
  [316, 238], [272, 238], [310, 120],
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = (x - 256) / 256;
    const dy = (y - 256) / 256;
    const d = Math.sqrt(dx * dx + dy * dy);

    // fundo radial
    const t = Math.min(1, d);
    const bgR = 8 + 14 * (1 - t);
    const bgG = 12 + 26 * (1 - t);
    const bgB = 34 + 46 * (1 - t);

    let r = bgR, g = bgG, b = bgB, a = 255;

    // orbe central
    if (d < 0.86) {
      const glow = Math.max(0, 1 - d / 0.86);
      const core = Math.max(0, 1 - d / 0.45);
      r = 34 * glow + 140 * core + 40;
      g = 210 * glow + 250 * core + 20;
      b = 250 * glow + 255 * core + 60;
      a = 255;
    }

    // raio
    if (inPolygon(x, y, bolt)) {
      r = 250; g = 252; b = 180; a = 255;
    }

    // brilho exterior
    const halo = Math.max(0, 1 - Math.abs(d - 0.92) / 0.1) * 60;
    r += halo; g += halo; b += halo * 0.8;

    setPx(x, y, Math.min(255, r), Math.min(255, g), Math.min(255, b), a);
  }
}

// --- codificação PNG ---
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filtro none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('Ícone gerado em build/icon.png');

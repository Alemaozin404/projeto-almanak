// Gera a splash screen do app Android com a marca do jogo (fundo escuro +
// orbe de energia central), sem dependências externas. Escreve os mesmos
// caminhos/formatos do template do Capacitor (drawable + drawable-port/land).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// [pasta, largura, altura] — mesmo formato do template do Capacitor
const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
];

// raio (relâmpago) no espaço 512×512 do ícone
const bolt = [
  [256, 120], [212, 252], [250, 252], [222, 392],
  [316, 238], [272, 238], [310, 120],
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Splash: fundo radial escuro + orbe central (diâmetro ≈ 42% do menor lado). */
function renderSplash(w, h) {
  const px = new Uint8Array(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const rad = Math.min(w, h) * 0.42;
  // raio centralizado na área do orbe (coords do bolt no espaço do orbe)
  const boltScaled = bolt.map(([bx, by]) => [cx - rad + (bx / 512) * rad * 2, cy - rad + (by / 512) * rad * 2]);
  const maxD = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // fundo radial: azul-escuro no centro → quase preto nas bordas
      const df = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxD;
      const bgR = 20 + 16 * (1 - df);
      const bgG = 30 + 28 * (1 - df);
      const bgB = 54 + 50 * (1 - df);

      let r = bgR, g = bgG, b = bgB, a = 255;

      // orbe central
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / rad;
      if (d < 1) {
        const glow = Math.max(0, 1 - d);
        const core = Math.max(0, 1 - d / 0.45);
        r = 34 * glow + 140 * core + 40;
        g = 210 * glow + 250 * core + 20;
        b = 250 * glow + 255 * core + 60;
      }

      // raio
      if (inPolygon(x, y, boltScaled)) {
        r = 250; g = 252; b = 180;
      }

      // anel de brilho na borda do orbe
      const halo = Math.max(0, 1 - Math.abs(d - 0.96) / 0.08) * 50;
      r += halo; g += halo; b += halo * 0.8;

      const i = (y * w + x) * 4;
      px[i] = Math.min(255, r); px[i + 1] = Math.min(255, g); px[i + 2] = Math.min(255, b); px[i + 3] = a;
    }
  }
  return encodePng(w, h, px);
}

// ── encoder PNG ──
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
function encodePng(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const resDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');
for (const [dir, w, h] of SPLASHES) {
  const out = path.join(resDir, dir, 'splash.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderSplash(w, h));
}
console.log(`Splash gerada (${SPLASHES.length} tamanhos) em android/app/src/main/res/*/splash.png`);

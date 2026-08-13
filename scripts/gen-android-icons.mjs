// Gera os ícones do launcher Android + PWA a partir do MESMO visual do jogo
// (orbe + raio), sem dependências externas:
//   - ic_launcher.png / ic_launcher_round.png nas 5 densidades (legado)
//   - ic_launcher_foreground.png (adaptativo API 26+ — arte na zona segura)
//   - public/icons/icon-{192,512}.png (manifest do PWA instalável)
// Escreve direto em android/app/src/main/res/mipmap-*/ e public/icons/.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const DENSITIES = [
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 },
];

// raio (relâmpago) no espaço 512×512 do ícone original
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

/**
 * Desenha o ícone do jogo em um canvas canvasSize×canvasSize.
 * A arte (artSize×artSize) é desenhada em offsetX/offsetY (0,0 = canto superior
 * esquerdo); round=true recorta a arte em círculo; fora da arte = transparente.
 */
function render(canvasSize, artSize, { offsetX = 0, offsetY = 0, round = false } = {}) {
  const px = new Uint8Array(canvasSize * canvasSize * 4);
  const setPx = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= canvasSize || y >= canvasSize) return;
    const i = (y * canvasSize + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const boltScaled = bolt.map(([bx, by]) => [bx * artSize / 512, by * artSize / 512]);
  const half = artSize / 2;

  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const ax = x - offsetX;
      const ay = y - offsetY;
      // fora da arte → transparente (fundo do foreground adaptativo, etc.)
      if (ax < 0 || ay < 0 || ax >= artSize || ay >= artSize) { setPx(x, y, 0, 0, 0, 0); continue; }

      const dx = (ax - half) / half;
      const dy = (ay - half) / half;
      const d = Math.sqrt(dx * dx + dy * dy);

      // fora do círculo (versão round) → transparente
      if (round && d > 1) { setPx(x, y, 0, 0, 0, 0); continue; }

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
      if (inPolygon(x - offsetX, y - offsetY, boltScaled)) {
        r = 250; g = 252; b = 180; a = 255;
      }

      // brilho exterior
      const halo = Math.max(0, 1 - Math.abs(d - 0.92) / 0.1) * 60;
      r += halo; g += halo; b += halo * 0.8;

      setPx(x, y, Math.min(255, r), Math.min(255, g), Math.min(255, b), a);
    }
  }
  return encodePng(canvasSize, px);
}

/** Ícone legado (quadrado ou round) — arte ocupa o canvas inteiro. */
function renderLegacy(size, round) {
  return render(size, size, { round });
}

/** Foreground adaptativo: arte com ~60% do canvas (zona segura de 66/108dp), centrada. */
function renderForeground(size) {
  const art = Math.round(size * 0.6);
  const offset = Math.floor((size - art) / 2);
  return render(size, art, { offsetX: offset, offsetY: offset });
}

// ── encoder PNG (mesmo do gen-icon.mjs, parametrizado) ──
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
function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writePng(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

const resDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');

for (const { name, size } of DENSITIES) {
  const mipmap = path.join(resDir, `mipmap-${name}`);
  writePng(path.join(mipmap, 'ic_launcher.png'), renderLegacy(size, false));
  writePng(path.join(mipmap, 'ic_launcher_round.png'), renderLegacy(size, true));
  writePng(path.join(mipmap, 'ic_launcher_foreground.png'), renderForeground(size));
}

// ── ícones do PWA instalável (manifest) ──
const pwaDir = path.join(process.cwd(), 'public', 'icons');
writePng(path.join(pwaDir, 'icon-192.png'), renderLegacy(192, false));
writePng(path.join(pwaDir, 'icon-512.png'), renderLegacy(512, false));

console.log('Ícones Android gerados em android/app/src/main/res/mipmap-*/');
console.log('Ícones PWA gerados em public/icons/');

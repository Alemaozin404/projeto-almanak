// Gera o banner de compartilhamento (Open Graph) do jogo — 1200×630, o tamanho
// que o WhatsApp/Facebook/Twitter mostram como preview do link. Mesma identidade
// visual dos ícones/splash (fundo radial escuro + orbe + raio) com o título do
// jogo em fonte pixel embutida. Zero dependências externas (encoder PNG próprio,
// igual aos outros scripts de assets).
// Saída: public/og-banner.png
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const W = 1200;
const H = 630;

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

// ── fonte pixel 5×7 (maiúsculas, dígitos e pontuação básica) ──
// cada glifo é 7 strings de 5 chars; '#' = pixel aceso
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '....#', '...#.', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

/** Desenha um texto em fonte pixel (5×7, largura do glifo = 6 células). */
function drawText(px, text, x, y, scale, color, accentColor = null) {
  const [cr, cg, cb] = color;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT['?'];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px2 = x + gx * scale + sx;
            const py = y + gy * scale + sy;
            if (px2 < 0 || py < 0 || px2 >= W || py >= H) continue;
            const i = (py * W + px2) * 4;
            px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = 255;
          }
        }
      }
    }
    // acento agudo sobre vogais (Ú etc.) — traço curto no topo do glifo
    if (accentColor && /[ÁÉÍÓÚ]/.test(ch)) {
      for (let sx = 0; sx < scale; sx++) {
        for (let sy = 0; sy < scale; sy++) {
          const px2 = x + 1 * scale + sx;
          const py = y - scale + sy;
          if (px2 < 0 || py < 0 || px2 >= W || py >= H) continue;
          const i = (py * W + px2) * 4;
          px[i] = accentColor[0]; px[i + 1] = accentColor[1]; px[i + 2] = accentColor[2]; px[i + 3] = 255;
        }
      }
      for (let sx = 0; sx < scale; sx++) {
        for (let sy = 0; sy < scale; sy++) {
          const px2 = x + 2 * scale + sx;
          const py = y - 2 * scale + sy;
          if (px2 < 0 || py < 0 || px2 >= W || py >= H) continue;
          const i = (py * W + px2) * 4;
          px[i] = accentColor[0]; px[i + 1] = accentColor[1]; px[i + 2] = accentColor[2]; px[i + 3] = 255;
        }
      }
    }
    x += 6 * scale;
  }
}

/** Comprimento em pixels de um texto na fonte (6 células por glifo). */
function textWidth(text, scale) {
  return text.length * 6 * scale;
}

// ── render do banner ──
function renderBanner() {
  const px = new Uint8Array(W * H * 4);
  // posição do orbe: esquerda, com espaço para o título à direita
  const ox = 320, oy = 330, rad = 235;
  const boltScaled = bolt.map(([bx, by]) => [ox - rad + (bx / 512) * rad * 2, oy - rad + (by / 512) * rad * 2]);
  const maxD = Math.sqrt(W * W + H * H) / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // fundo radial: azul-escuro no centro → quase preto nas bordas
      const df = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2) / maxD;
      let r = 10 + 12 * (1 - df);
      let g = 16 + 22 * (1 - df);
      let b = 32 + 40 * (1 - df);

      // glow do orbe (luz azul-ciano ao redor)
      const do2 = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2) / (rad * 1.9);
      if (do2 < 1) {
        const g2 = (1 - do2) ** 2 * 42;
        r += g2 * 0.25; g += g2 * 0.8; b += g2;
      }
      // brilho de accent no canto superior direito (como o body do jogo)
      const dR = Math.sqrt((x - W * 0.92) ** 2 + (y - H * 0.12) ** 2) / (maxD * 1.1);
      if (dR < 1) {
        const g3 = (1 - dR) ** 2 * 22;
        r += g3 * 0.2; g += g3 * 0.6; b += g3;
      }

      let a = 255;

      // orbe central
      const d = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2) / rad;
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

      const i = (y * W + x) * 4;
      px[i] = Math.min(255, Math.round(r));
      px[i + 1] = Math.min(255, Math.round(g));
      px[i + 2] = Math.min(255, Math.round(b));
      px[i + 3] = a;
    }
  }

  // ── título: NÚCLEO CLICKER (duas linhas, fonte pixel) ──
  const titleColor = [236, 247, 255];      // quase branco
  const accentCyan = [125, 224, 255];      // ciano da marca
  const scale = 11;
  const line1 = 'NÚCLEO';
  const line2 = 'CLICKER';
  const w1 = textWidth(line1, scale);
  const w2 = textWidth(line2, scale);
  const tx = W - 60 - Math.max(w1, w2);    // alinhado à direita
  const ty = 170;
  drawText(px, line1, tx, ty, scale, titleColor, accentCyan);
  drawText(px, line2, tx, ty + 8 * scale, scale, titleColor, accentCyan);

  // ── subtítulo: tagline ──
  const tagline = 'CLIQUE. COLETE. EVOLUA.';
  const tagScale = 5;
  const tw = textWidth(tagline, tagScale);
  drawText(px, tagline, tx + Math.max(w1, w2) - tw, ty + 17 * scale, tagScale, accentCyan);
  // separador decorativo antes do subtítulo
  const sepY = ty + 16 * scale + 12;
  for (let s = 0; s < 2; s++) {
    for (let sx = 0; sx < Math.max(w1, w2); sx++) {
      const px2 = tx + sx;
      if (px2 < 0 || px2 >= W) continue;
      const i = ((sepY + s) * W + px2) * 4;
      px[i] = 70; px[i + 1] = 170; px[i + 2] = 210; px[i + 3] = 255;
    }
  }

  return encodePng(W, H, px);
}

// ── encoder PNG (mesmo dos outros scripts de assets) ──
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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

const out = path.join(process.cwd(), 'public', 'og-banner.png');
fs.writeFileSync(out, renderBanner());
console.log(`✅ Banner OG gerado em ${out} (${W}×${H})`);

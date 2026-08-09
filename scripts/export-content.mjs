/**
 * Exporta o conteúdo do jogo (src/content/*) para server/content.json.
 *
 * Uso:
 *   npm run content:export
 *
 * Rode SEMPRE após editar notícias, eventos, banners, códigos, changelog ou
 * janelas de manutenção, e commite o server/content.json atualizado — o Vercel
 * redeploya e o jogo passa a exibir o novo conteúdo.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'server', '.content-export.mjs');

await build({
  entryPoints: [path.join(root, 'scripts', 'content-export-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile,
  logLevel: 'silent',
});

const mod = await import(pathToFileURL(outfile).href);
const json = JSON.stringify(mod.default, null, 2);
writeFileSync(path.join(root, 'server', 'content.json'), json, 'utf8');
console.log(`✅ server/content.json atualizado (${(json.length / 1024).toFixed(1)} KB) — v${mod.default.gameVersion}, ${mod.default.events.length} eventos, ${mod.default.updates.length} updates`);

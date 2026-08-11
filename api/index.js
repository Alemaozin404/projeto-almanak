/**
 * Entrypoint serverless do Vercel — DEPLOY UNIFICADO (jogo + backend no mesmo domínio).
 *
 * O Vercel importa este arquivo como função serverless (convenção /api). Ele
 * re-exporta o app Express de server/index.js — o esbuild do Vercel resolve os
 * imports relativos (../server/index.js, ./store.js) e as dependências
 * instaladas na raiz (express, cors, dotenv, decimal.js).
 *
 * O server/content.json é lido em runtime com fallback de caminhos resilientes
 * (ver loadContent em server/index.js) e incluído no pacote via
 * vercel.json → functions.api.index.includeFiles.
 *
 * NOTA: não chamar app.listen() aqui — em serverless isso é proibido.
 */
import { createApp } from '../server/index.js';

export default createApp();

/**
 * Entrypoint serverless do Vercel.
 *
 * O Vercel importa este arquivo como função (server/api/index.js). Exportamos
 * o app Express de server/index.js — o Vercel cuida de instanciar a função e
 * rotear as requisições (ver server/vercel.json).
 *
 * NOTA: não chamar app.listen() aqui — em serverless isso é proibido.
 */
import { createApp } from '../index.js';

export default createApp();

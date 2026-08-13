/**
 * GameConfig — configuração central.
 * Não espalhar constantes pelo projeto: economia, passe, offline, admin e debug vivem aqui.
 */
export const GameConfig = {
  version: '1.6.0',

  // ── Passe Premium global ──
  pass: {
    /** Preço do passe em R$ — o servidor cobra o MESMO valor (espelhado em server/index.js). */
    priceBRL: 9.9,
    /** Preço do passe em CRÉDITOS 💳 — moeda principal (≈ R$ 9,00, alinhado ao Pix de R$ 9,90). */
    creditsPrice: 180,
    /**
     * Chave pública Ed25519 (32 bytes hex) dos recibos do passe — par gerado com
     * `npm run gen:receipt-keys`. O app SÓ conhece a pública; a privada vive no
     * servidor (RECEIPT_PRIVATE_KEY). TROCA = nova chave pública + novo build.
     */
    receiptPublicKey: '8820d8c85dc950e12830fac749623c92c65672ec0870deabe8bdb60600ca59d6',
    maxLevel: 100,
    /** XP total para completar o nível `n` (curva progressiva). */
    xpForLevel: (n: number): number => Math.round(250 * Math.pow(n, 1.65)),
    /** Limite diário de XP do passe (anti-progressão absurda). */
    dailyXpCap: 33000,
    /** XP do passe comprado por 1 diamante 💎 (1 diamante = N XP). */
    xpPerDiamond: 500,
    /** Fontes de XP por ação (pode ser escalado por bônus). */
    xpPerClick: 0.5,
    xpPerMinute: 8,
    xpPerQuest: 50,
    xpPerDailyQuest: 125,
    xpPerWeeklyQuest: 250,
    xpPerEventChapter: 150,
  },

  // ── Offline ──
  offline: {
    defaultCapHours: 12,
    maxCapHours: 168,
    efficiency: 0.5,
  },

  // ── Combo / cliques ──
  click: {
    minIntervalMs: 30, // anti-automação
  },

  // ── Economia de moedas ──
  economy: {
    /** Fator global de recompensas em moedas 🪙 (0.25 = todas as fontes pagam 1/4 do valor original). */
    goldRewardScale: 0.25,
  },

  // ── Carteira Ficha/Créditos ──
  wallet: {
    /** Preço de 100 fichas em R$. FICHAS SÃO BARATAS: usadas só em eventos premium. */
    pricePer100Fichas: 3.99,
    /** Valor de referência de 1 crédito em R$ (exibição). */
    creditBRL: 0.05,
    /** Créditos por diamante — 1 crédito = 1 diamante. */
    creditsPerDiamond: 1,
    /** URL do backend de pagamentos Pix (produção — Vercel). Vazio = gateway local simulado (dev). */
    backendUrl: 'https://projeto-almanak-alemaozin404s-projects.vercel.app',
    /** Chave do localStorage que sobrescreve backendUrl (útil em testes/runtime). */
    backendUrlKey: 'nc_pix_backend_url',
    /** Segredo compartilhado app→backend (proteção leve contra chamadas externas). */
    appSharedSecret: 'nucleoclicker-pix-v1',
    /** Intervalo do polling de status do Pix (ms). */
    pixPollingMs: 5000,
    /** Tempo máximo de um pedido Pix pendente antes de expirar (ms). */
    pixOrderExpiryMs: 30 * 60 * 1000,
    /** Pacote de teste do admin: 1 diamante por R$ 0,01 (valida o fluxo Pix real). */
    pixTestPackId: 'pix_test_1d',
    pixTestPriceBRL: 0.01,
    pixTestDiamonds: 1,
  },

  // ── App Android ──
  android: {
    /**
     * URL direta do APK no GitHub Releases (última versão) — usada no QR Code
     * de instalação em Configurações → Sistema (PC/web). O workflow de release
     * anexa o APK ao Release; sem keystore o asset é `app-debug.apk` (padrão).
     */
    apkUrl: 'https://github.com/Alemaozin404/projeto-almanak/releases/latest/download/app-debug.apk',
  },

  // ── Conta (sistema de contas + save automático no servidor) ──
  account: {
    /** Intervalo do envio automático do save da conta ao servidor (em horas). */
    autoSaveHours: 1,
    /**
     * Poll do sync AO VIVO entre dispositivos (segundos): o app consulta só o
     * cabeçalho do save da conta no servidor (?meta=1) e restaura automaticamente
     * quando outro dispositivo salvou um progresso mais novo (PC ↔ celular).
     * ~20s = quase instantâneo (~3 requisições leves/min por dispositivo).
     */
    liveSyncSeconds: 20,
    /** Chave do localStorage onde a sessão da conta é guardada. */
    sessionStorageKey: 'nc_account_session_v1',
    /** Chave do localStorage onde o slot escolhido para vincular o save da conta é guardado ('' = automático). */
    slotStorageKey: 'nc_account_slot_v1',
  },

  // ── Admin ──
  admin: {
    /** Chave do localStorage onde o PIN (com hash) é armazenado — separado do save. */
    pinStorageKey: 'nc_admin_pin_v1',
    sessionStorageKey: 'nc_admin_session_v1',
    contentStorageKey: 'nc_admin_content_v1',
    salesStorageKey: 'nc_admin_sales_v1',
    auditStorageKey: 'nc_admin_audit_v1',
    securityStorageKey: 'nc_admin_security_v1',
    maxAuditEntries: 500,
    maxSecurityEntries: 300,
  },

  // ── Privacidade ──
  privacy: {
    defaultScope: 'local' as 'public' | 'private' | 'local',
  },

  // ── Status ──
  status: {
    maxMessageLength: 60,
  },

  // ── Avatar ──
  avatar: {
    maxEmojiLength: 4,
  },

  // ── Skins ──
  skins: {
    /** Tamanho máximo da coleção considerada para o índice misterioso. */
    mysteryRevealThreshold: 200,
  },
} as const;

/** Paridade com o package.json — usar nos patch notes e popup. */
export const GAME_VERSION_STRING: string = GameConfig.version;

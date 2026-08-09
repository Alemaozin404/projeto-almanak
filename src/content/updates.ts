/**
 * Atualizações / Patch Notes — conteúdo data-driven.
 * A versão mais recente aqui é a "versão do jogo". O UpdateManager
 * controla o popup de novidades e as recompensas por versão.
 */
import type { EventRewardSpec } from './rewards';

export const GAME_VERSION = '1.2.4';

export type PatchTag = 'DESTAQUE' | 'NOVO' | 'ALTERADO' | 'CORRIGIDO' | 'REMOVIDO';
export type PatchSection = { tag: PatchTag; icon: string; items: string[] };

export interface PatchNote {
  version: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  description: string;
  hotfix?: boolean;
  sections: PatchSection[];
  /** Recompensa única concedida ao atualizar para esta versão. */
  reward?: EventRewardSpec;
}

export let UPDATES: PatchNote[] = [
  {
    version: '1.2.4',
    title: 'PIX ONLINE COM MERCADO PAGO',
    date: '2026-08-09',
    description: 'A Carteira agora funciona com pagamentos Pix reais via Mercado Pago: cobrança com QR Code, confirmação automática por polling e entrega de fichas só após o pagamento ser aprovado.',
    sections: [
      { tag: 'DESTAQUE', icon: '💳', items: ['Pix real integrado ao Mercado Pago — QR Code e copia-e-cola verdadeiros na Carteira', 'Backend próprio (server/) que guarda o access token com segurança e cria as cobranças', 'Fichas entregues automaticamente quando o pagamento é aprovado (polling a cada 5s)'] },
      { tag: 'NOVO', icon: '✨', items: ['Backend Pix (Express + API Mercado Pago): criar cobrança, consultar status e webhook com validação de assinatura HMAC', 'Pedidos Pix pendentes sobrevivem ao reinício do jogo (save v8) e expiram após 30 min sem pagamento', 'Modo online automático: configurando a URL do backend, a Carteira passa a cobrar de verdade', 'Documentação: docs/arquitetura-pix.md com o mapa completo do fluxo'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Carteira: compra cria cobrança real e exibe QR; fichas só chegam após aprovação (modo simulado continua sem backend)', 'Save v8 com migração automática v7→v8 (pedidos Pix)'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Concessão idempotente — chamadas concorrentes nunca dobram fichas', 'Webhook rejeita assinaturas malformadas sem travar o servidor'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.3',
    title: 'CARTEIRA FICHA/CRÉDITOS COM PIX',
    date: '2026-08-09',
    description: 'Nova Carteira com Fichas 🎰 compradas via Pix, conversão em Créditos 💳 (1 ficha = 1 crédito) e troca por Diamantes 💎 (1 crédito = 1 diamante) para gastar no jogo.',
    sections: [
      { tag: 'DESTAQUE', icon: '🎰', items: ['Nova tela Carteira: comprar Fichas 🎰 via Pix (100 fichas = R$ 6,25)', 'Conversão 1 ficha = 1 crédito 💳 e troca por Diamantes 💎 (1 crédito = 1 diamante)', 'Diamantes gastos no sistema premium: caixas, consumíveis e upgrades da Loja'] },
      { tag: 'NOVO', icon: '✨', items: ['4 pacotes de fichas com bônus progressivo (100 a 2.000 fichas)', 'Recibo Pix com código copia-e-cola (EMV + CRC16) após a compra', 'Fichas e créditos protegidos no save: não são resetados por prestígio/ascensão', 'Gateway Pix (LocalPixGateway) pronto para integrar um backend real de pagamentos'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Save v7 com migração automática v6→v7 (carteira)', 'Saldo de fichas, créditos e diamantes visíveis na topbar', 'Estatísticas novas: fichas compradas, créditos convertidos e diamantes comprados com créditos'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.2',
    title: 'PROGRESSÃO MAIS DIFÍCIL',
    date: '2026-08-09',
    description: 'Upar de nível ficou ~5× mais difícil com a nova curva de XP, e as conquistas pararam de dar ouro — apenas as mais difíceis (prestígio pra cima) ainda recompensam moedas.',
    sections: [
      { tag: 'DESTAQUE', icon: '📈', items: ['Curva de XP do jogador endurecida em ~5× (160·n²·⁰⁵ + 200n + 100)', 'Conquistas sem recompensa em ouro — só as 7 de prestígio pra cima mantêm moedas', 'Títulos exclusivos das conquistas extremas preservados'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['XP por nível: 100·n¹·⁸+120n+80 → 160·n²·⁰⁵+200n+100 (nível 100: ~410 mil → ~2 milhões de XP)', '~50 conquistas deixaram de conceder ouro (mantêm títulos, fragmentos, caixas e outras recompensas)', 'Conquistas que mantêm ouro: Primeiro Prestígio, Fênix, Imortal, Primeira Ascensão, Ascendente, Transcendente e Número da Sorte'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.1',
    title: 'CONQUISTAS RECALIBRADAS',
    date: '2026-08-09',
    description: 'Alvos de ouro das conquistas recalibrados para a economia endurecida (÷4), fechando o ciclo da rebalança de moedas da 1.1.2.',
    sections: [
      { tag: 'DESTAQUE', icon: '🪙', items: ['Conquistas de ouro com alvos ÷4: Primeiras Moedas 100→25, Milionário 1M→250 mil, Bilionário 1 bi→250 milhões, Magnata 1 tri→250 bilhões'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Descrições das conquistas atualizadas para os novos valores', 'Recompensas mantidas (reduzidas automaticamente na concessão pela escala global de moedas)'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.1.2',
    title: 'ECONOMIA DE MOEDAS ENDURECIDA',
    date: '2026-08-09',
    description: 'Ganhar moedas 🪙 agora é muito mais difícil: todas as fontes grátis pagam 1/4 do valor, e os alvos das missões de ouro foram recalibrados para a nova economia.',
    sections: [
      { tag: 'DESTAQUE', icon: '🪙', items: ['Moedas 🪙 4× mais difíceis de obter: missões, conquistas, códigos, login, caixas, drops de clique, offline e venda de itens pagam 1/4', 'Alvos das missões de "ganhe X ouro" recalibrados proporcionalmente', 'Ouro dos pacotes pagos mantido (compra com dinheiro real)'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Drop de ouro no clique: 5% → 1,25% do ganho', 'Caixas: drops de moedas 4× menores (250×25^raridade)', 'Gerador de Ouro: 0,5 → 0,125 🪙/s (afeta offline e ganho passivo)', 'Venda de pets e equipamentos devolve 1/4 do valor anterior', 'Missões de ouro com alvos ÷4: Ouro do Dia 50.000→12.500, Magnata 100M→25M, Rico 1T→250 bi, Semana de Ouro 1 bi→250M'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.1.1',
    title: 'DIAMANTES VALORIZADOS',
    date: '2026-08-09',
    description: 'Diamantes 💎 agora valem ainda mais: comprar e gastar a moeda premium ficou 2× mais caro, enquanto o ouro 🪙 mantém os preços normais.',
    sections: [
      { tag: 'DESTAQUE', icon: '💎', items: ['Diamantes 💎 2× mais caros para comprar: pacotes agora de R$ 3,99 a R$ 199,99 (mesmos 💎 por pacote)', 'Gastar 💎 ficou 2× mais caro: caixas, consumíveis premium e upgrades premium com preços dobrados', 'Ouro 🪙 intocado: compras com moedas continuam com os mesmos preços de sempre'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Pacotes: Mini R$ 3,99 · Iniciante R$ 9,99 · Popular R$ 19,99 · Premium R$ 39,99 · Lendário R$ 99,99 · Supremo R$ 199,99', 'Caixas: Básica 50💎 · Rara 160💎 · Épica 400💎 · Lendária 1.400💎 · Mítica 3.600💎 · Celestial 9.000💎', 'Consumíveis premium: Elixir de Diamante 400💎 · Reator Portátil 600💎 · Manancial de Ouro 600💎', 'Upgrades premium: Aura de Diamante 600💎 · Núcleo de Diamante 1.000💎 · Reator de Diamante 1.500💎 · Ultra Crítico 6.000💎'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.1.0',
    title: 'LOJA DE MOEDAS E DIAMANTES PAGOS',
    date: '2026-08-09',
    description: 'Nova loja de compra com dinheiro real, moedas renomeadas (Moedas 🪙 e Diamantes 💎) e passe reformulado com trilha grátis a cada 5 níveis.',
    sections: [
      { tag: 'DESTAQUE', icon: '🛍️', items: ['Loja de compra com dinheiro real: 4 pacotes de Moedas + Diamantes (R$ 4,99 a R$ 49,99)', 'Diamantes 💎 agora são moeda exclusivamente paga — todas as fontes grátis foram removidas', 'Passe Premium reformulado: trilha grátis libera recompensa a cada 5 níveis'] },
      { tag: 'NOVO', icon: '✨', items: ['Aba "Moedas" na Loja com pacotes (Iniciante, Popular, Premium, Lendário) e confirmação de compra'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Ouro 🪙 renomeado para Moedas e Cristais 💎 para Diamantes (saves mantidos)', 'Recompensas de conquistas, missões, caixas, eventos, códigos, login diário, passe e presentes de atualização sem diamantes — substituídas por ouro equivalente', 'Passe: trilha grátis com 20 recompensas (níveis 5, 10, 15…100); premium mantém os 100 níveis'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.0.4',
    title: 'PASSE PREMIUM ASSINADO',
    date: '2026-08-09',
    description: 'A posse do Passe Premium agora é protegida por recibo de compra assinado com chave local — editar o save para liberar o passe deixa de funcionar.',
    hotfix: true,
    sections: [
      { tag: 'DESTAQUE', icon: '🔐', items: ['Passe Premium protegido por recibo assinado (chave local no app)', 'Posse verificada a cada load: save com owned=true sem recibo válido é revertido'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Compra do passe emite recibo assinado (pedido + horário + jogador)', 'Assinatura é ligada ao save: copiar recibo de outro save não libera o passe', 'Revogação remove também os itens exclusivos concedidos (avatares, título Premium)'] },
    ],
    reward: { gold: '2000000', boxes: [{ boxId: 'basic', qty: 1 }] },
  },
  {
    version: '3.0.1',
    title: 'REBALANCEAMENTO DE DIFICULDADE',
    date: '2026-08-08',
    description: 'Progressão mais desafiadora: curvas de XP do jogador, pets e Passe Premium mais íngremes, fontes de XP reduzidas e teto diário do passe ajustado.',
    hotfix: true,
    sections: [
      { tag: 'DESTAQUE', icon: '🔥', items: ['Curva de XP do jogador endurecida (até ~4,6× no nível 100)', 'Pets com 2× mais XP por nível em toda a curva', 'Passe Premium com ~2,1-3,3× mais XP por nível'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Nível do jogador: XP por nível 50·n¹·⁶+100n+60 → 100·n¹·⁸+120n+80', 'Pets: XP por nível 50·1.35ⁿ·(n+1) → 100·1.35ⁿ·(n+1) (2× uniforme)', 'Passe Premium: XP total 120·n¹·⁵⁵ → 250·n¹·⁶⁵', 'Fontes de XP do jogador reduzidas: clique 0,1→0,05 XP, por minuto 1→0,5 XP, recompensas de missões pela metade', 'Fontes de XP do passe reduzidas: clique 1→0,5, minuto 15→8, missões 100/250/500→50/125/250, capítulo 300→150', 'Teto diário do passe ajustado de 10.000 para 33.000 para acompanhar a nova curva'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Título Omega agora usa a fórmula oficial do passe (GameConfig.pass.xpForLevel) em vez de valor fixo'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'basic', qty: 1 }] },
  },
  {
    version: '3.0.0',
    title: 'CONFIGURAÇÃO, PERFIL, PASSE PREMIUM E ADMIN',
    date: '2026-08-07',
    description: 'Reformulação de Configurações, Perfil com status/avatar/privacidade, Passe Premium de 100 níveis, skins ocultas e Admin Control Center.',
    sections: [
      { tag: 'DESTAQUE', icon: '🔥', items: ['Passe Premium 🎟️ — 100 níveis, trilha grátis + premium, pet exclusivo Cronos', 'Skins não adquiridas agora são conteúdo oculto (??? + silhueta)', 'Admin Control Center com PIN local, permissões granulares e auditoria'] },
      { tag: 'NOVO', icon: '✨', items: ['Configurações em 10 categorias (Geral, Interface, Gráficos, Áudio, Gameplay, Notificações, Acessibilidade, Privacidade, Dados, Sistema)', 'Canais de áudio independentes (música, efeitos, interface, eventos, notificações, ambiente)', 'Perfil reformulado: avatar, moldura, efeito, badge, status e mensagem personalizada', 'Sistema de status (Online, AFK, Não perturbe, Em evento…) com indicador local', 'Privacidade com escopos (Público/Privado/Somente local)', '5 skins exclusivas do passe + recompensas premium ocultas', 'Títulos premium (Premium, Omega) e da temporada', 'Admin: dashboard, gerenciador de conteúdo (rascunho→publicar), recompensas, simulação, logs de auditoria e segurança, backups'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Save v6 com migração v5→v6 (perfil, passe premium, avatarItems)', 'Skins ocultas no Armário: sem nome/imagem/efeitos para itens não adquiridos', 'XP do passe com teto diário anti-abuso'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Bug de reinício do teto diário do passe (dia NaN)', 'Deep-merge de configurações em saves antigos', 'Preview de skins premium respeitando revealPremiumRewards'] },
    ],
    reward: { gold: '10000000', boxes: [{ boxId: 'event', qty: 1 }], skins: ['cursor_bolt'], avatarItems: ['bd_clicker'] },
  },
  {
    version: '2.0.0',
    title: 'CLICKMASTER — LIVE OPS',
    date: '2026-08-07',
    description: 'O jogo vira uma plataforma de conteúdo contínuo: skins, eventos, temporadas, banners e atualizações.',
    sections: [
      { tag: 'DESTAQUE', icon: '🔥', items: ['Sistema completo de LiveOps (EventManager, BannerManager, UpdateManager)', '28 skins em 9 categorias com raridades próprias', 'Temporada 4 — Cyber Genesis com passe de 10 níveis'] },
      { tag: 'NOVO', icon: '✨', items: ['Página Armário 🎨 com pesquisa, filtros, favoritos e preview', 'Evento Cyber Overdrive com moeda, loja, passe, história e recompensas diárias', 'Event Pass (trilha grátis e premium)', 'Calendário de eventos com countdown', 'Carrossel de banners na Home', 'Tela de Atualizações com patch notes e notícias', 'Season Hub com countdown e recompensas', 'Sistema de códigos resgatáveis', 'Recompensa de atualização e compensação', 'Login diário de 7 dias', 'Página de manutenção programada'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Eventos agora usam timestamps absolutos (mais precisos)', 'Skins separadas da progressão (cosméticos por padrão)', 'Moeda por evento (Fragmentos Cyber, Lunares, Doces, Flocos, Brasas)'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Estabilidade do save com migração v4→v5', 'Combo e críticos mais consistentes', 'Performance da Home com carrossel memoizado'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'basic', qty: 1 }], skins: ['num_gold'] },
  },
  {
    version: '1.0.0',
    title: 'LANÇAMENTO',
    date: '2026-07-20',
    description: 'Núcleo Clicker 1.0 — o clicker completo com prestígio, ascensão e transcendência.',
    sections: [
      { tag: 'DESTAQUE', icon: '🔥', items: ['Prestígio → Ascensão → Transcendência', 'Pets, caixas, missões, conquistas e árvore de habilidades'] },
      { tag: 'NOVO', icon: '✨', items: ['86+ sistemas integrados', 'Offline progress com teto configurável', 'Save com 3 slots, exportação e backup'] },
    ],
  },
];

export function latestUpdate(): PatchNote {
  return UPDATES[0];
}

export function updateByVersion(version: string): PatchNote | undefined {
  return UPDATES.find((u) => u.version === version);
}

/** Versões com recompensa de atualização pendente (para o UpdateManager). */
export function hasUpdateReward(version: string): boolean {
  return updateByVersion(version)?.reward != null;
}

/** Hidrata o changelog com dados do servidor (GET /api/content). */
export function hydrateUpdates(items: PatchNote[]): void {
  UPDATES = Array.isArray(items)
    ? items.filter((u) => u && typeof u.version === 'string')
    : UPDATES;
}

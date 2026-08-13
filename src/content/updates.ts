/**
 * Atualizações / Patch Notes — conteúdo data-driven.
 * A versão mais recente aqui é a "versão do jogo". O UpdateManager
 * controla o popup de novidades e as recompensas por versão.
 */
import type { EventRewardSpec } from './rewards';

export const GAME_VERSION = '1.5.0';

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
    version: '1.5.0',
    title: 'COMBOS NA LOJA + QR CODE DO APP ANDROID',
    date: '2026-08-13',
    description: 'A Loja ganhou a aba Combos 🧺 com 11 pacotes mistos — sempre com Créditos 💳 e recheados de diamantes, moedas, XP do passe, caixas, skins, títulos e badges exclusivos — e desconto progressivo nos créditos (+10% a +60%). No PC e no site, Configurações → Sistema agora gera um QR Code que instala o app Android direto no celular. E o Admin criou combos personalizados completos sem recompilar.',
    sections: [
      { tag: 'DESTAQUE', icon: '🧺', items: ['Aba Combos na Loja: 11 pacotes mistos com Créditos 💳 + diamantes 💎, moedas 🪙, XP do passe ⚡, caixas 📦, skins 🎨, títulos 🏆 e badges 🔖', 'Desconto progressivo nos créditos dos Combos: +10% no Combo Iniciante até +60% no Combo Supremo (bônus visível no card)', 'QR Code do app Android em Configurações → Sistema: aponte a câmera do celular e o APK da última versão é baixado e instalado direto'] },
      { tag: 'NOVO', icon: '✨', items: ['4 títulos exclusivos dos Combos (Mítico, Divino, Celestial e Supremo) com bônus de sorte/produção', '4 badges de avatar exclusivas dos Combos — equipáveis no Perfil', 'Admin → Vendas: combos mistos completos (créditos, XP, skins, caixas, títulos e badges) sem recompilar'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Créditos dos Combos recalibrados com desconto progressivo maior nos pacotes mais caros', 'Carteira e Loja exibem o conteúdo completo dos pacotes mistos, inclusive títulos e badges'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.4.2',
    title: 'CRÉDITOS — A MOEDA PRINCIPAL',
    date: '2026-08-12',
    description: 'Os Créditos 💳 viraram a moeda principal do jogo: ganharam categoria própria na Loja com vários preços e agora pagam caixas e consumíveis premium (além do Passe, avatares e eventos). As Fichas 🎰 ficaram bem mais baratas, já que são usadas só em eventos premium. E o Passe Premium passou a custar 180 créditos — valor equivalente ao Pix.',
    sections: [
      { tag: 'DESTAQUE', icon: '💳', items: ['Créditos são a MOEDA PRINCIPAL: nova aba na Loja com 4 pacotes (100/300/800/2.000) via Pix', 'Caixas e consumíveis premium agora aceitam pagamento com Créditos (botão 💳 ao lado do 💎)', 'Fichas 🎰 muito mais baratas (100 por R$ 3,99) — moeda exclusiva de eventos premium'] },
      { tag: 'NOVO', icon: '✨', items: ['Aba Créditos na Loja com conversão para Diamantes 💎 (1💳 = 1💎)', 'Carteira abre direto em Créditos'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Passe Premium: 250 → 180 créditos (≈ R$ 9,00 — alinhado ao preço Pix de R$ 9,90)', 'Pacotes de fichas: 100=R$ 3,99 · 300=R$ 9,99 · 800=R$ 24,99 · 2.000=R$ 59,99'] },
    ],
  },
  {
    version: '1.4.1',
    title: 'ECONOMIA REESTRUTURADA — MOEDAS SEPARADAS',
    date: '2026-08-12',
    description: 'A economia foi reestruturada em três moedas pagas com papéis claros: Fichas 🎰 (moeda exclusiva de eventos premium, sem usar moedas grátis), Créditos 💳 (moeda universal: compra o Passe Premium, avatares pagos e entrada em eventos) e Diamantes 💎 (exclusivos — só via Pix ou conversão de créditos). A energia também ficou mais escassa: geradores mais caros e upgrades de CLIQUE agora são comprados com energia.',
    sections: [
      { tag: 'DESTAQUE', icon: '💎', items: ['Moedas separadas: Fichas 🎰 (eventos premium), Créditos 💳 (moeda universal) e Diamantes 💎 (exclusivos — via Pix ou conversão de créditos)', 'Conversão fichas→créditos REMOVIDA — os créditos agora têm pacotes próprios via Pix (100/300/800/2.000)'] },
      { tag: 'NOVO', icon: '✨', items: ['Passe Premium comprável com Créditos 💳 (250) além do Pix', 'XP do passe comprável com Diamantes 💎 (1💎 = 500 XP)', 'Avatares premium compráveis individualmente com Créditos (Netrunner, Estelar, moldura/efeito/badge)', 'Evento premium Baile VIP 💃 sempre ativo com loja paga em Fichas 🎰 e itens compráveis com Diamantes'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Energia escassa: geradores de energia mais caros e com produção reduzida', 'Upgrades de CLIQUE agora custam ENERGIA ⚡ (produção/economia seguem em moedas 🪙 e os premium em 💎)'] },
    ],
  },
  {
    version: '1.4.0',
    title: 'AMIGOS + PERFIL PÚBLICO',
    date: '2026-08-12',
    description: 'Novo sistema de Amigos: adicione outros jogadores por nome de usuário, aceite solicitações e veja quem está online agora — com presença ao vivo e perfil público (avatar, nível, prestígios e status) visível para os amigos. A sincronização da conta também ganhou avisos claros de falha e estado ao vivo.',
    sections: [
      { tag: 'DESTAQUE', icon: '👥', items: ['Amigos: adicione outros jogadores por nome de usuário e confirme solicitações (aceitar/recusar)', 'Presença AO VIVO na lista: bolinha 🟢 quando o amigo está online agora (sinal a cada 1 min) e horário do último visto', 'Perfil público do amigo: avatar, nível, prestígios, status e mensagem — visível só para amigos'] },
      { tag: 'NOVO', icon: '✨', items: ['Nova tela Amigos no menu: lista, solicitações recebidas e busca por nome', 'Modal de perfil do amigo com avatar, nível, prestígios e status/mensagem', 'Lista de amigos atualizada a cada 30s com último visto automático'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Falhas de sincronização da conta agora avisam o jogador (⚠️ “Falha ao sincronizar”) quando há conta conectada e backend configurado', 'Tela Conta com status ao vivo: enviando agora, último erro e última sincronização', 'Download manual do save da conta cria backup do save local antes de sobrescrever (paridade com a restauração automática)'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Confirmação mútua de amizade deixava uma solicitação órfã no lado receptor', 'Limite de 100 amigos agora vale também no aceite (não só no envio)', 'CI valida a restauração do save em todo push (testes de conta dedicados)'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.3.1',
    title: 'STATUS DE SINCRONIZAÇÃO NA TOPBAR',
    date: '2026-08-12',
    description: 'A barra superior agora mostra quando o save está sendo enviado para a sua conta (↻ sincronizando… → ✅ sincronizado), com horário da última sincronização e aviso de erro. E ao voltar ao menu principal, o save é enviado para a conta na hora, com confirmação visual.',
    sections: [
      { tag: 'DESTAQUE', icon: '🔄', items: ['Indicador de sincronização no chip da conta: “↻ sincronizando…” durante o envio e “✅ sincronizado” logo depois (com a hora da última sincronização no tooltip)', 'Ao voltar ao menu principal, o save é enviado para a conta IMEDIATAMENTE — mesmo se você fechar a aba do site em seguida, o envio conclui (e um aviso “👤 Conta sincronizada” confirma)'] },
      { tag: 'NOVO', icon: '✨', items: ['Tooltip do chip da conta com estado atual, última sincronização e último erro (⚠️) se houver', 'Falhas de sincronização aparecem no indicador para você saber que o servidor não recebeu o save'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Voltar ao menu principal (ou às Configurações) agora dispara o envio da conta sem esperar o save em disco — mais confiável no site', 'Envios concorrentes (auto-save + manual + timer de 1h) exibem o estado correto no indicador'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.3.0',
    title: 'SYNC APP ↔ SITE — MESMO SAVE EM QUALQUER LUGAR',
    date: '2026-08-12',
    description: 'O save agora sincroniza de verdade entre o app e o site via conta: jogou 5 minutos no site com a sua conta, fechou e abriu no app? O progresso (pets, moedas, tudo) está lá. A conta é atualizada a cada save local — não só a cada 1 hora — e o boot sobe ou restaura automaticamente conforme o lado mais novo.',
    sections: [
      { tag: 'DESTAQUE', icon: '🔄', items: ['Sincronização bidirecional app ↔ site: o save da conta é atualizado a cada save local (antes era só a cada 1 hora)', 'Fechar o app ou o site envia o progresso na hora (push final com keepalive — a aba pode fechar sem perder nada)', 'No boot: se a conta estiver mais nova, restaura (com confirmação); se o local estiver mais novo, sobe para a conta'] },
      { tag: 'NOVO', icon: '✨', items: ['Botão "Salvar agora" do menu também sincroniza a conta', 'Voltar ao menu principal / sair do jogo envia o save para a conta'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Login com jogo aberto: jogo local mais novo atualiza a conta silenciosamente (o outro dispositivo recebe no próximo boot)', 'Push automático com throttle de 1 min — a conta fica sempre fresca sem sobrecarregar o servidor'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.9',
    title: 'SISTEMA DE CONTAS',
    date: '2026-08-12',
    description: 'Novo sistema de contas com e-mail: crie sua conta com Gmail, confirme por código (e receba um e-mail de agradecimento 💛), recupere a senha se esquecer e tenha o save guardado automaticamente no servidor a cada 1 hora — restaurável em qualquer computador.',
    sections: [
      { tag: 'DESTAQUE', icon: '👤', items: ['Contas por e-mail Gmail: registro, código de confirmação (com agradecimento 💛) e recuperação de senha', 'Save automático no servidor a cada 1 hora — o progresso fica guardado na conta e pode ser restaurado em outro computador', 'Save da conta vinculado ao slot, com restauração automática (pedindo confirmação antes de sobrescrever o save local)'] },
      { tag: 'NOVO', icon: '✨', items: ['Tela Conta no menu principal e na barra lateral: criar conta, entrar, confirmar e-mail e recuperar senha', 'Indicador de conta na barra superior com countdown do próximo save automático', 'Card da conta no menu principal mostrando o usuário e o slot vinculado', 'Escolha a qual slot o save da conta fica vinculado (AUTO/SLOT1-3)', 'Troca de senha estando logado (derruba as outras sessões da conta)'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Sessão persistida no dispositivo: ao abrir o jogo com a conta conectada, o save da conta é verificado automaticamente', 'Primeiro envio: quando a conta ainda não tem save, o jogo sobe o atual como primeiro backup (silencioso)'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.8',
    title: 'PIX DE PRODUÇÃO ATIVO',
    date: '2026-08-11',
    description: 'As compras com Pix agora usam as credenciais de PRODUÇÃO do Mercado Pago: o jogador paga com o QR Code real e as fichas/moedas/diamantes são entregues automaticamente quando o pagamento é aprovado.',
    sections: [
      { tag: 'DESTAQUE', icon: '💳', items: ['Pagamentos Pix REAIS habilitados: Carteira, Loja de Moedas e Passe Premium cobram de verdade no Mercado Pago', 'QR Code e copia-e-cola válidos — o jogador paga pelo app do banco e a entrega é automática após a aprovação'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Backend de produção no ar: token APP_USR ativo (antes era modo teste)', 'CI 100% verde: token configurado e verificado de ponta a ponta'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.7',
    title: 'PATCH DE MANUTENÇÃO',
    date: '2026-08-11',
    description: 'Manutenção da infraestrutura: pipeline de publicação e CI estáveis para entregas mais rápidas e confiáveis de versões futuras.',
    hotfix: true,
    sections: [
      { tag: 'ALTERADO', icon: '⚙', items: ['Pipeline de publicação do instalador estabilizado (permissões e modo de publicação do GitHub Releases)', 'Dependências do servidor sincronizadas no lockfile — CI e builds reproduzíveis'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['Publicação automática do instalador: o release agora é publicado de verdade (não fica em rascunho) — auto-update encontra a versão nova'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.6',
    title: '100% ONLINE POR PADRÃO',
    date: '2026-08-11',
    description: 'O jogo agora é online por padrão: o save sobe para a nuvem automaticamente, o ranking publica seus recordes sozinho e um indicador mostra a conexão em tempo real. Deploy unificado: jogo e backend no mesmo domínio.',
    sections: [
      { tag: 'DESTAQUE', icon: '☁️', items: ['Save na nuvem AUTOMÁTICO: a cada auto-save o progresso vai para o servidor silenciosamente (sem botões manuais)', 'Restauração automática no boot: se a nuvem estiver mais nova, restaura com backup local antes de sobrescrever', 'Ranking global automático: Prestígio/Ascensão/Transcendência publicam o melhor ciclo de cada tipo sozinhos'] },
      { tag: 'NOVO', icon: '✨', items: ['Indicador de conexão na barra superior — 🟢 online / 🔴 offline / ⚪ modo local', 'Configuração "Sincronização automática" em Configurações → Dados (ligada por padrão, pode desligar)', 'Deploy unificado no Vercel: jogo e backend servidos no MESMO domínio'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Tela de Ranking usa o mesmo motor de publicação automática dos recordes', 'Textos do jogo corrigidos — não é mais "100% offline"'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
  {
    version: '1.2.5',
    title: 'ONLINE AO VIVO — HEARTBEAT + LOJA PIX DO ADMIN',
    date: '2026-08-11',
    description: 'O jogo agora mantém presença online com um sinal oculto a cada 1 minuto (heartbeat), recebe conteúdo novo na hora, avisa sobre manutenção iminente e o Admin ganhou venda de diamantes/moedas com Pix real.',
    sections: [
      { tag: 'DESTAQUE', icon: '💓', items: ['Heartbeat oculto: sinal ao servidor a cada 1 min — presença online e conteúdo novo re-sincronizado NA HORA', 'Aviso de manutenção iminente (o servidor sinaliza antes do bloqueio)', 'Entrega autoritativa no servidor: o que você recebe no Pix é decidido AQUI (o save não manda)'] },
      { tag: 'NOVO', icon: '✨', items: ['Admin → Vendas: pacotes de diamantes/moedas com Pix real (teste embutido: R$ 0,01 por 1💎)', 'Aba Jogadores Online no Admin (presença do heartbeat)', 'Backend Vercel como padrão + banners de status (sem conexão / servidor protegido / MP sem token)'] },
      { tag: 'ALTERADO', icon: '⚙', items: ['Recibos do Passe Premium assinados com a chave Ed25519 de PRODUÇÃO do servidor', 'Content.json com timestamps UTC — determinístico no CI'] },
      { tag: 'CORRIGIDO', icon: '🐛', items: ['payer.email com TLD válido e notification_url só com BASE_URL público (o MP recusava localhost)', 'CI instala dependências do servidor antes dos testes'] },
    ],
    reward: { gold: '5000000', boxes: [{ boxId: 'event', qty: 1 }] },
  },
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

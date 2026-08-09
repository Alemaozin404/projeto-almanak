import { D } from '../core/bignum';
import { GameEngine } from '../game/engine';
import { ACHIEVEMENTS } from '../achievements/achievements';
import { PET_DEFS } from '../pets/pets';
import { debugEventOverrides } from '../events/events';
import { RESOURCES } from '../economy/resources';
import { UPGRADE_MAP } from '../shop/upgrades';
import { now } from '../core/utils';
import { SKINS } from '../content/skins';
import { EVENTS_ALL } from '../content/events';
import { UpdateManager } from '../liveops/UpdateManager';
import { ContentManager } from '../liveops/ContentManager';

export interface DebugAction {
  id: string;
  label: string;
  icon: string;
  run: (engine: GameEngine) => string | Promise<string>;
}

export const DEBUG_ACTIONS: DebugAction[] = [
  {
    id: 'give_gold',
    label: '+1M Moedas',
    icon: '🪙',
    run: (e) => {
      e.addRes('gold', D(1e6));
      return 'Adicionado 1M de ouro';
    },
  },
  {
    id: 'give_energy',
    label: '+1B Energia',
    icon: '⚡',
    run: (e) => {
      e.addRes('energy', D(1e9));
      return 'Adicionado 1B de energia';
    },
  },
  {
    id: 'give_crystals',
    label: '+500 Diamantes',
    icon: '💎',
    run: (e) => {
      e.addRes('crystals', D(500));
      return 'Adicionado 500 cristais';
    },
  },
  {
    id: 'give_all',
    label: 'Dar todos os recursos',
    icon: '💰',
    run: (e) => {
      for (const r of Object.values(RESOURCES)) {
        e.addRes(r.id, D(1e9));
      }
      return 'Todos os recursos recebidos';
    },
  },
  {
    id: 'set_level',
    label: '+10 níveis',
    icon: '🆙',
    run: (e) => {
      e.addXp(D(1e9));
      return `Nível atual: ${e.state.level}`;
    },
  },
  {
    id: 'unlock_achievements',
    label: 'Desbloquear conquistas',
    icon: '🏆',
    run: (e) => {
      const before = Object.keys(e.state.achievements).length;
      for (const a of ACHIEVEMENTS) {
        if (e.state.achievements[a.id] === undefined) e.state.achievements[a.id] = now();
      }
      e.checkTitles();
      return `${Object.keys(e.state.achievements).length - before} conquistas desbloqueadas`;
    },
  },
  {
    id: 'spawn_pet',
    label: 'Spawnar pet aleatório',
    icon: '🐾',
    run: (e) => {
      const pet = PET_DEFS[Math.floor(Math.random() * PET_DEFS.length)];
      const kind = e.grantPet(pet.id);
      return `${kind === 'new' ? 'Novo' : 'Duplicata'}: ${pet.name} (${pet.rarity})`;
    },
  },
  {
    id: 'give_boxes',
    label: '+10 Caixas Básicas',
    icon: '📦',
    run: (e) => {
      e.state.boxes.basic = (e.state.boxes.basic ?? 0) + 10;
      return 'Adicionado 10 caixas básicas';
    },
  },
  {
    id: 'simulate_offline',
    label: 'Simular 8h offline',
    icon: '🌙',
    run: (e) => {
      e.state.lastSeen = now() - 8 * 3600 * 1000;
      const res = e.computeOffline();
      if (!res) return 'Sem produção suficiente para offline';
      e.applyOffline(res);
      return `Simulado: +${res.energy.toFixed(0)} energia, +${res.gold.toFixed(0)} ouro`;
    },
  },
  {
    id: 'test_prestige',
    label: 'Dar energia p/ prestígio',
    icon: '🌀',
    run: (e) => {
      e.state.prestige.energyThisCycle = D(1e9).toString();
      const preview = e.prestigePreview();
      return `Prestígio renderia: ${preview.toFixed(0)} fragmentos`;
    },
  },
  {
    id: 'events_on',
    label: 'Ativar todos os eventos',
    icon: '🎊',
    run: (e) => {
      for (const id of ['natal', 'halloween', 'verao', 'demo', 'cyber', 'lunar', 'lightning']) debugEventOverrides.add(id);
      void e;
      return 'Eventos ativados (modo debug)';
    },
  },
  {
    id: 'events_off',
    label: 'Desativar overrides',
    icon: '🚫',
    run: () => {
      debugEventOverrides.clear();
      return 'Overrides de eventos removidos';
    },
  },
  {
    id: 'grant_skin',
    label: 'Conceder 5 skins aleatórias',
    icon: '🎨',
    run: (e) => {
      const pool = SKINS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
      for (const sk of pool) e.grantSkin(sk.id);
      return `${pool.map((p) => p.name).join(', ')} concedidas`;
    },
  },
  {
    id: 'grant_all_skins',
    label: 'Conceder TODAS as skins',
    icon: '🖼️',
    run: (e) => {
      for (const sk of SKINS) e.grantSkin(sk.id);
      return `${SKINS.length} skins concedidas`;
    },
  },
  {
    id: 'grant_pass_xp',
    label: '+50k XP em todos os passes',
    icon: '🎫',
    run: (e) => {
      for (const ev of EVENTS_ALL) e.trackXp(`ev_${ev.id}`, D(50000));
      return 'XP de passe adicionado';
    },
  },
  {
    id: 'grant_premium',
    label: 'Liberar passes premium',
    icon: '💎',
    run: (e) => {
      for (const ev of EVENTS_ALL) if (!e.state.premiumPasses.includes(`ev_${ev.id}`)) e.state.premiumPasses.push(`ev_${ev.id}`);
      e.notify('pass');
      return 'Passes premium liberados';
    },
  },
  {
    id: 'simulate_update_popup',
    label: 'Simular popup de update',
    icon: '🚀',
    run: (e) => {
      e.state.lastSeenVersion = '1.0.0';
      return `Popup visível: ${UpdateManager.shouldShowPopup(e.state)}`;
    },
  },
  {
    id: 'grant_update_reward',
    label: 'Presente de atualização',
    icon: '🎁',
    run: (e) => {
      e.state.lastSeenVersion = UpdateManager.version;
      const ok = e.grantUpdateReward();
      return ok ? 'Presente concedido' : 'Já concedido antes';
    },
  },
  {
    id: 'test_countdown',
    label: 'Testar countdown (evento em 2h)',
    icon: '⏳',
    run: (e) => {
      const ev = EVENTS_ALL.find((x) => x.id === 'lunar');
      if (!ev) return 'Evento lunar não encontrado';
      // desloca a janela do evento para daqui a 2h (teste de countdown/upcoming)
      const nowMs = Date.now();
      ev.startAt = nowMs + 2 * 3600 * 1000;
      ev.endAt = nowMs + 7 * 24 * 3600 * 1000;
      e.notify('debug');
      return 'Festival Lunar: começa em 2h (veja Eventos → Calendário)';
    },
  },
  {
    id: 'compensation',
    label: 'Enviar compensação 2.0',
    icon: '🩹',
    run: (e) => {
      void e;
      const c = e.pendingCompensations().find((x) => x.id === 'update20');
      return c ? 'Compensação disponível em Atualizações' : 'Compensação já resgatada';
    },
  },
  {
    id: 'simulate_maintenance',
    label: 'Simular manutenção (5 min)',
    icon: '🔧',
    run: (e) => {
      const w = UpdateManager.simulateMaintenance(5 * 60 * 1000);
      UpdateManager.setDebugMaintenance(w);
      e.notify('debug');
      return 'Manutenção ativa por 5 min — a tela de manutenção será exibida';
    },
  },
  {
    id: 'clear_maintenance',
    label: 'Encerrar manutenção simulada',
    icon: '✅',
    run: (e) => {
      UpdateManager.setDebugMaintenance(null);
      e.notify('debug');
      return 'Manutenção encerrada';
    },
  },
  {
    id: 'content_stats',
    label: 'Estatísticas de conteúdo',
    icon: '📊',
    run: (e) => {
      const st = ContentManager.stats(e.state.skins.owned);
      return `${st.skins} skins (${st.skinsOwned} possuídas) · ${st.events} eventos · ${st.banners} banners · ${st.news} notícias · ${st.updates} updates · ${st.seasons} temporadas · ${st.codes} códigos`;
    },
  },
  {
    id: 'reset_save',
    label: 'Resetar save atual',
    icon: '🗑️',
    run: (e) => {
      const fresh = new GameEngine();
      Object.assign(e.state, fresh.state);
      return 'Save resetado';
    },
  },
  {
    id: 'max_upgrades',
    label: 'Upgrades no máximo',
    icon: '⬆️',
    run: (e) => {
      for (const [id, def] of Object.entries(UPGRADE_MAP)) {
        e.state.upgrades[id] = def.maxLevel;
      }
      e.addRes('gold', D(1e15));
      e.invalidate();
      return `${Object.keys(UPGRADE_MAP).length} upgrades no máximo`;
    },
  },
  // ── Update 3.0: perfil, passe premium, admin ─────────────
  {
    id: 'grant_premium_pass',
    label: 'Adquirir Passe Premium',
    icon: '🎟️',
    run: async (e) => {
      const r = await e.buyPremiumPass();
      return r.ok ? 'Passe Premium adquirido' : r.reason ?? 'Falha';
    },
  },
  {
    id: 'grant_pass_levels',
    label: '+100k XP no passe premium',
    icon: '📈',
    run: (e) => {
      e.addPassXp(100000);
      return `Passe nível: ${e.premiumPassLevel()}`;
    },
  },
  {
    id: 'set_status',
    label: 'Status: Em evento',
    icon: '🟣',
    run: (e) => {
      e.setStatus('evento');
      e.setStatusMessage('Farmando para o próximo Prestígio…');
      return 'Status definido';
    },
  },
  {
    id: 'grant_avatar_premium',
    label: 'Conceder avatares premium',
    icon: '🖼️',
    run: (e) => {
      for (const id of ['av_cyber', 'av_star', 'fr_premium', 'fx_premium', 'bd_premium']) e.grantAvatarItem(id);
      return 'Avatares premium concedidos';
    },
  },
  {
    id: 'reveal_skins',
    label: 'Revelar 3 skins misteriosas',
    icon: '🔓',
    run: (e) => {
      const hidden = SKINS.filter((sk) => !e.isSkinOwned(sk.id)).slice(0, 3);
      for (const sk of hidden) e.grantSkin(sk.id);
      return hidden.length > 0 ? `${hidden.map((h) => h.name).join(', ')} reveladas` : 'Nenhuma skin oculta restante';
    },
  },
  {
    id: 'admin_login',
    label: 'Abrir Admin Control Center',
    icon: '🛡️',
    run: () => {
      return 'Abra a tela Admin na barra lateral (modo debug) para configurar/login do painel.';
    },
  },
];

/** Verifica se o modo debug está habilitado. */
export function debugEnabled(engine: GameEngine): boolean {
  return engine.state.flags.debugMode === 1;
}

export function setDebug(engine: GameEngine, on: boolean): void {
  engine.state.flags.debugMode = on ? 1 : 0;
  engine.notify('debug');
}

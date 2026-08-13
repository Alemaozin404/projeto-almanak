import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';
import { SKINS, equippedSkin, skinStatus, isSkinOwned } from '../src/content/skins';
import { skinRarity } from '../src/content/skinRarities';
import { eventById, eventStatus, activeEvents, debugEventOverrides } from '../src/content/events';
import { activeSeason } from '../src/content/seasons';
import { BannerManager } from '../src/liveops/BannerManager';
import { UpdateManager } from '../src/liveops/UpdateManager';
import { ContentManager } from '../src/liveops/ContentManager';
import { CODES } from '../src/content/codes';
import { GAME_VERSION } from '../src/content/updates';

const T = (s: string) => new Date(s).getTime();

describe('Skins (LiveOps)', () => {
  it('catálogo completo: categorias e raridades válidas', () => {
    expect(SKINS.length).toBeGreaterThan(20);
    const cats = new Set(SKINS.map((s) => s.category));
    expect(cats.size).toBeGreaterThanOrEqual(8); // 9 categorias
    for (const s of SKINS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(skinRarity(s.rarity).name.length).toBeGreaterThan(0);
    }
  });

  it('concede, equipa e favorita', () => {
    const e = new GameEngine();
    expect(e.grantSkin('num_gold')).toBe(true);
    expect(e.isSkinOwned('num_gold')).toBe(true);
    e.toggleSkinFavorite('num_gold');
    expect(e.isSkinFavorite('num_gold')).toBe(true);
    e.toggleSkinFavorite('num_gold');
    expect(e.isSkinFavorite('num_gold')).toBe(false);
    e.equipSkin('num_gold');
    expect(equippedSkin(e.state).id).toBe('num_gold');
  });

  it('skin limitada fica "ended" após expirar', () => {
    const cyber = SKINS.find((s) => s.id === 'cyber_core')!;
    expect(cyber.expiresAt).toBeDefined();
    expect(skinStatus(cyber, T('2026-08-10T12:00:00'))).toBe('limited');
    expect(skinStatus(cyber, T('2026-12-31T12:00:00'))).toBe('ended');
  });

  it('skin de progressão desbloqueia por condição', () => {
    const e = new GameEngine();
    expect(isSkinOwned(e.state, 'plasma')).toBe(false);
    e.state.prestige.count = 1;
    expect(isSkinOwned(e.state, 'plasma')).toBe(true);
  });
});

describe('Eventos (status)', () => {
  const cyber = eventById('cyber')!;
  const verao = eventById('verao')!;
  const lunar = eventById('lunar')!;

  it('demo sempre ativo', () => {
    expect(activeEvents(new Date(T('2026-08-10T12:00:00')), true).some((ev) => ev.id === 'demo')).toBe(true);
  });

  it('cyber: live → ending_soon → ended', () => {
    expect(eventStatus(cyber, T('2026-08-10T12:00:00'))).toBe('live');
    expect(eventStatus(cyber, T('2026-08-12T12:00:00'))).toBe('ending_soon'); // <24h restantes
    expect(eventStatus(cyber, T('2026-08-20T12:00:00'))).toBe('ended');
  });

  it('verão encerrado vira arquivado após 30 dias', () => {
    expect(eventStatus(verao, T('2026-08-10T12:00:00'))).toBe('archived');
  });

  it('lunar upcoming tem countdown até o início', () => {
    expect(eventStatus(lunar, T('2026-08-10T12:00:00'))).toBe('upcoming');
    expect(eventStatus(lunar, T('2026-08-25T12:00:00'))).toBe('live');
  });

  it('moeda e XP de evento por clique', () => {
    const e = new GameEngine();
    debugEventOverrides.add('cyber');
    try {
      const before = D(e.eventState(cyber).tokens);
      e.click('manual');
      expect(D(e.eventState(cyber).tokens).gt(before)).toBe(true);
      expect(D(e.passXp('ev_cyber')).gt(D(0))).toBe(true);
    } finally {
      debugEventOverrides.clear();
    }
  });

  it('compra de skin na loja do evento', () => {
    const e = new GameEngine();
    debugEventOverrides.add('cyber');
    try {
      const st = e.eventState(cyber);
      st.tokens = '6000';
      const r = e.buyEventItem('cyber', 'skin_cyber_core');
      expect(r.ok).toBe(true);
      expect(e.isSkinOwned('cyber_core')).toBe(true);
      expect(D(st.tokens).lte(D('6000'))).toBe(true);
    } finally {
      debugEventOverrides.clear();
    }
  });

  it('recompensa diária de evento: ordem e duplicidade', () => {
    const e = new GameEngine();
    const r0 = e.claimEventDaily('demo', 0);
    expect(r0.ok).toBe(true);
    const dup = e.claimEventDaily('demo', 0);
    expect(dup.ok).toBe(false);
    const r2 = e.claimEventDaily('demo', 2);
    expect(r2.ok).toBe(true);
    expect(e.eventState(eventById('demo')!).dailyClaimed.length).toBe(2);
  });
});

describe('Banners', () => {
  it('prioridade: update vem antes de evento, oferta por último', () => {
    const actives = BannerManager.active(T('2026-08-10T12:00:00'));
    const first = actives[0];
    expect(first.def.priority).toBe('update');
    expect(first.def.id).toBe('update_20');
    const last = actives[actives.length - 1];
    expect(['offer', 'news']).toContain(last.def.priority);
  });

  it('ignora banners fora da janela', () => {
    const actives = BannerManager.active(T('2026-08-10T12:00:00'));
    expect(actives.some((b) => b.def.id === 'evt_lunar')).toBe(false); // começa 14/08
    expect(actives.some((b) => b.def.id === 'evt_cyber')).toBe(true);
  });

  it('banner de evento expõe countdown', () => {
    const cyber = BannerManager.active(T('2026-08-10T12:00:00')).find((b) => b.def.id === 'evt_cyber');
    expect(cyber).toBeDefined();
    expect(cyber!.countdown).toBeGreaterThan(0);
    expect(cyber!.countdownText.length).toBeGreaterThan(0);
  });
});

describe('Atualizações', () => {
  it('popup aparece uma vez por versão', () => {
    const e = new GameEngine();
    expect(UpdateManager.shouldShowPopup(e.state)).toBe(true); // lastSeenVersion vazio
    UpdateManager.markSeen(e.state);
    expect(UpdateManager.shouldShowPopup(e.state)).toBe(false);
    e.state.lastSeenVersion = '1.0.0';
    expect(UpdateManager.shouldShowPopup(e.state)).toBe(true);
  });

  it('recompensa de atualização única', () => {
    const e = new GameEngine();
    UpdateManager.markSeen(e.state);
    expect(e.pendingUpdateReward()).toBe(true);
    expect(e.grantUpdateReward()).toBe(true);
    expect(e.pendingUpdateReward()).toBe(false);
    expect(e.grantUpdateReward()).toBe(false);
  });

  it('versão semver comparável', () => {
    expect(UpdateManager.compare('2.1.0', '2.0.9')).toBeGreaterThan(0);
    expect(UpdateManager.compare('2.0.0', '2.0.0')).toBe(0);
    expect(UpdateManager.compare('1.9.9', '2.0.0')).toBeLessThan(0);
    expect(ContentManager.version()).toBe(GAME_VERSION);
  });
});

describe('Passe (eventos e temporadas)', () => {
  it('nível acompanha XP e recompensa é única por nível', () => {
    const e = new GameEngine();
    const cyber = eventById('cyber')!;
    const levels = cyber.pass!.levels;
    const trackId = 'ev_cyber';
    e.trackXp(trackId, D(1000)); // nível 2 (500 < 1000 < 1200)
    expect(e.passLevel(trackId, levels)).toBe(2);
    expect(e.claimPassReward(trackId, levels, 1, 'free').ok).toBe(true);
    expect(e.claimPassReward(trackId, levels, 1, 'free').ok).toBe(false); // duplicado
    expect(e.claimPassReward(trackId, levels, 3, 'free').ok).toBe(false); // nível não alcançado
    expect(e.claimPassReward(trackId, levels, 2, 'premium').ok).toBe(false); // sem premium
  });

  it('passe premium libera a trilha premium', () => {
    const e = new GameEngine();
    const cyber = eventById('cyber')!;
    const levels = cyber.pass!.levels;
    const trackId = 'ev_cyber';
    e.trackXp(trackId, D(5000)); // nível 5
    e.state.premiumPasses.push(trackId);
    const r = e.claimPassReward(trackId, levels, 3, 'premium'); // nível 3 tem recompensa premium
    expect(r.ok).toBe(true);
    expect(e.getRes('gold').gte(D(2500))).toBe(true);
  });

  it('temporada ativa existe em agosto/2026 e ganha XP por clique', () => {
    const season = activeSeason(T('2026-08-10T12:00:00'));
    expect(season).toBeDefined();
    expect(season!.number).toBe(4);
    const e = new GameEngine();
    e.click('manual');
    expect(D(e.passXp('season_season4')).gt(D(0))).toBe(true);
  });
});

describe('Códigos e login diário', () => {
  it('resgata código uma única vez', () => {
    const e = new GameEngine();
    const r = e.redeemCode('welcome2');
    expect(r.ok).toBe(true);
    expect(e.getRes('gold').gte(D(250000))).toBe(true);
    expect(e.redeemCode('WELCOME2').ok).toBe(false);
    expect(e.redeemCode('INVALIDO').ok).toBe(false);
  });

  it('código expirado é recusado', () => {
    const e = new GameEngine();
    // CYBER2026 expira em 12/08/2026 23:59 UTC — conteúdo ao vivo com prazo.
    // O teste NÃO depende do relógio: compara o resultado com a expiração do
    // próprio código, então continua válido antes e depois do prazo.
    const code = CODES.find((c) => c.id === 'CYBER2026');
    const expired = code ? Date.now() > (code.expiresAt ?? Infinity) : true;
    const r = e.redeemCode('CYBER2026');
    expect(r.ok).toBe(!expired);
    if (!expired) {
      expect(e.isSkinOwned('cursor_cyber')).toBe(true);
      expect(e.hasPremiumPass('cyber')).toBe(true);
    }
  });

  it('login diário respeita a janela de 20h', () => {
    const e = new GameEngine();
    expect(e.dailyLoginAvailable()).toBe(true);
    const r = e.claimDailyLogin();
    expect(r.ok).toBe(true);
    expect(r.day).toBe(0);
    expect(e.state.dailyLogin.count).toBe(1);
    expect(e.dailyLoginAvailable()).toBe(false);
    // simula passagem do tempo
    e.state.dailyLogin.lastClaim = Date.now() - 21 * 3600 * 1000;
    expect(e.dailyLoginAvailable()).toBe(true);
    expect(e.dailyLoginDay()).toBe(1);
  });

  it('login diário entrega CRÉDITOS 💳 progressivos (economia testável)', () => {
    const e = new GameEngine();
    // dia 1 entrega créditos de verdade
    const r0 = e.claimDailyLogin();
    expect(r0.ok).toBe(true);
    expect(r0.reward.credits).toBeGreaterThan(0);
    expect(e.getRes('credits').toString()).toBe(String(r0.reward.credits));
    // ciclo completo: todos os 7 dias entregam créditos, crescendo até o jackpot do dia 7
    let total = r0.reward.credits ?? 0;
    let prev = r0.reward.credits ?? 0;
    for (let i = 1; i < 7; i++) {
      e.state.dailyLogin.lastClaim = Date.now() - 21 * 3600 * 1000;
      const r = e.claimDailyLogin();
      expect(r.ok).toBe(true);
      expect(r.day).toBe(i);
      expect(r.reward.credits ?? 0).toBeGreaterThanOrEqual(prev); // progressivo (não regride)
      prev = r.reward.credits ?? 0;
      total += prev;
    }
    // total semanal relevante para testar a economia (passe = 180 💳)
    expect(total).toBeGreaterThan(180);
    // getter de preview reflete o ciclo
    expect(e.dailyLoginReward(6).credits).toBeGreaterThanOrEqual(e.dailyLoginReward(0).credits!);
  });

  it('compensação é única', () => {
    const e = new GameEngine();
    expect(e.pendingCompensations().length).toBeGreaterThan(0);
    const c = e.pendingCompensations()[0];
    expect(e.claimCompensation(c.id).ok).toBe(true);
    expect(e.claimCompensation(c.id).ok).toBe(false);
  });
});

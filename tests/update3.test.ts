import { describe, expect, it, beforeEach } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';
import { createInitialState } from '../src/game/initial';
import { defaultSettings } from '../src/game/types';
import { validateState } from '../src/save/validation';
import { migrateSave } from '../src/save/migrations';
import { SAVE_VERSION } from '../src/game/types';
import { GameConfig } from '../src/config/GameConfig';
import { hashPin, verifyPin, isValidPin, randomSalt } from '../src/security/hash';
import { roleHas, rolesHave, ADMIN_ROLES, ALL_PERMISSIONS } from '../src/admin/permissions';
import { validateContent, type AdminContent } from '../src/admin/content';
import { STATUS_PRESETS, statusOf } from '../src/profile/status';
import { AVATAR_CATALOG } from '../src/profile/avatars';
import { SKINS, mysteryLabel, isSkinRevealed, hiddenSkins, collectionSkinProgress, premiumLockLabel } from '../src/content/skins';
import { GAME_PASS_LEVELS, passLevelFromXp, passNextLevel } from '../src/pass/GamePass';
import { setupAdminPin, loginAdmin, logoutAdmin, isAdminLoggedIn, hasAdminPin } from '../src/admin/auth';
import { audit, auditLog, securityLogEntries, clearAuditLogs } from '../src/admin/audit';
import { saveDraft, publishContent, autoBackup, backupList, restoreBackup, loadContent } from '../src/admin/content';
import { SEASON_ID } from '../src/content/seasons';

// ── mock de localStorage (para admin content/auth) ──
// A chave do backend Pix retorna '' → compras ficam no gateway local simulado
// (sem rede) — necessário para os testes de compra do passe premium.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (k === GameConfig.wallet.backendUrlKey ? '' : mem.get(k) ?? null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  clear: () => mem.clear(),
};

beforeEach(() => mem.clear());

describe('Configurações (Update 3.0)', () => {
  it('save v5 é migrado para v6 sem perder progresso', () => {
    const old = createInitialState();
    (old as any).schemaVersion = 5;
    delete (old as any).profile;
    delete (old as any).premiumPass;
    delete (old as any).avatarItems;
    (old as any).settings = {
      notation: 'short', sfxEnabled: true, musicEnabled: false, sfxVolume: 0.7, musicVolume: 0.4,
      uiScale: 1, fontScale: 1, showFloatingNumbers: true, showParticles: true, reducedMotion: false,
      autoSaveMinutes: 1, offlineCapHours: 12, colorblindMode: false, debugMode: false,
    };
    old.name = 'Jogador V5';
    const migrated = migrateSave(old);
    expect(migrated.schemaVersion).toBe(SAVE_VERSION);
    expect(migrated.name).toBe('Jogador V5');
    expect(migrated.profile.status).toBe('online');
    expect(migrated.premiumPass.owned).toBe(false);
    expect(migrated.avatarItems).toEqual([]);
    // a validação completa o shape das settings (deep-merge com padrões)
    const { state } = validateState(migrated);
    expect(state.settings.audio.sfx.enabled).toBe(true);
    expect(state.settings.audio.music.enabled).toBe(false);
    expect(state.settings.privacy.profile).toBe('local');
    expect(state.settings.gameplay.confirmPrestige).toBe(true);
  });

  it('validação corrige settings corrompidos e restaura padrões', () => {
    const raw = createInitialState() as any;
    raw.settings = { ...defaultSettings(), autoSaveMinutes: 'abc' as any, offlineCapHours: -5 };
    raw.settings.audio = { music: { enabled: true, volume: 9 } };
    const { state, result } = validateState(raw);
    expect(result.ok).toBe(true);
    expect(state.settings.autoSaveMinutes).toBeGreaterThanOrEqual(0.1);
    expect(state.settings.offlineCapHours).toBeGreaterThanOrEqual(1);
    expect(state.settings.audio.music.volume).toBeLessThanOrEqual(1);
  });

  it('canais de áudio independentes e bloco de privacidade', () => {
    const e = new GameEngine();
    e.setAudioChannel('ui', { volume: 0.2 });
    expect(e.state.settings.audio.ui.volume).toBeCloseTo(0.2);
    e.updateSettingsBlock('privacy', { stats: 'public' });
    expect(e.privacyOf('stats')).toBe('public');
    expect(e.privacyOf('profile')).toBe('local');
  });

  it('tema: padrão é default, inválidos são sanitizados e neon é preservado', () => {
    expect(defaultSettings().theme).toBe('default');
    const raw = createInitialState() as any;
    raw.settings.theme = 'bogus';
    const { state, result } = validateState(raw);
    expect(result.ok).toBe(true);
    expect(state.settings.theme).toBe('default');
    raw.settings.theme = 'neon';
    const { state: st2 } = validateState(raw);
    expect(st2.settings.theme).toBe('neon');
  });

  it('merge de áudio por canal nunca perde canais em saves parciais', () => {
    const raw = createInitialState() as any;
    raw.settings.audio = { sfx: { enabled: true, volume: 0.9 } }; // save parcial (só sfx)
    const { state } = validateState(raw);
    const channels = ['music', 'sfx', 'ui', 'events', 'notifications', 'ambient'];
    for (const ch of channels) {
      expect(state.settings.audio[ch]).toBeDefined();
      expect(typeof state.settings.audio[ch].enabled).toBe('boolean');
      expect(state.settings.audio[ch].volume).toBeGreaterThanOrEqual(0);
    }
    expect(state.settings.audio.sfx.volume).toBeCloseTo(0.9); // preservado
  });

  it('restaurar padrões via defaultSettings é completo', () => {
    const d = defaultSettings();
    expect(d.audio.sfx.enabled).toBe(true);
    expect(d.gameplay.confirmPrestige).toBe(true);
    expect(d.notifications.achievements).toBe(true);
    expect(d.revealPremiumRewards).toBe(false);
  });
});

describe('Perfil, status e avatar (Update 3.0)', () => {
  it('status definido é validado e persiste', () => {
    const e = new GameEngine();
    e.setStatus('farmando');
    expect(e.state.profile.status).toBe('farmando');
    expect(statusOf(e.state.profile.status as any).color).toBeTruthy();
    e.setStatus('invalido' as any);
    expect(e.state.profile.status).toBe('farmando');
    e.setStatusMessage('x'.repeat(200));
    expect(e.state.profile.statusMessage.length).toBe(GameConfig.status.maxMessageLength);
  });

  it('avatares: progresso libera itens; premium exige passe', () => {
    const e = new GameEngine();
    expect(e.avatarItemAvailable(AVATAR_CATALOG.icons, 'av_default')).toBe(true);
    expect(e.avatarItemAvailable(AVATAR_CATALOG.icons, 'av_cyber')).toBe(false); // premium
    e.state.level = 10;
    expect(e.avatarItemAvailable(AVATAR_CATALOG.icons, 'av_hero')).toBe(true);
    e.setAvatarIcon('av_hero');
    expect(e.state.profile.avatarIcon).toBe('av_hero');
    e.setAvatarIcon('av_cyber');
    expect(e.state.profile.avatarIcon).toBe('av_hero'); // bloqueado
  });

  it('títulos premium: pass_premium exige passe', () => {
    const e = new GameEngine();
    e.checkTitles();
    expect(e.state.titles.includes('pass_premium')).toBe(false);
    e.state.premiumPass.owned = true;
    e.checkTitles();
    expect(e.state.titles.includes('pass_premium')).toBe(true);
  });

  it('STATUS_PRESETS tem todos os presets exigidos', () => {
    const ids = STATUS_PRESETS.map((s) => s.id);
    for (const id of ['online', 'away', 'afk', 'dnd', 'offline', 'jogando', 'farmando', 'explorando', 'evento']) {
      expect(ids).toContain(id);
    }
  });
});

describe('Passe Premium global (Update 3.0)', () => {
  it('100 níveis com XP progressiva', () => {
    expect(GAME_PASS_LEVELS.length).toBe(100);
    expect(GAME_PASS_LEVELS[0].level).toBe(1);
    expect(GAME_PASS_LEVELS[99].level).toBe(100);
    for (let i = 1; i < GAME_PASS_LEVELS.length; i++) {
      expect(GAME_PASS_LEVELS[i].xp).toBeGreaterThan(GAME_PASS_LEVELS[i - 1].xp);
    }
  });

  it('nível a partir da XP e progresso do próximo nível', () => {
    expect(passLevelFromXp(0)).toBe(0);
    expect(passLevelFromXp(GAME_PASS_LEVELS[0].xp)).toBe(1);
    expect(passLevelFromXp(GAME_PASS_LEVELS[9].xp)).toBe(10);
    const next = passNextLevel(0);
    expect(next).not.toBeNull();
    expect(next!.level).toBe(1);
    expect(passNextLevel(1e12)).toBeNull(); // nível máximo
  });

  it('XP tem teto diário (anti-abuso)', () => {
    const e = new GameEngine();
    e.addPassXp(GameConfig.pass.dailyXpCap + 1000);
    expect(e.state.premiumPass.xp).toBe(GameConfig.pass.dailyXpCap);
    expect(e.state.flags.passXpDay).toBe(GameConfig.pass.dailyXpCap);
    // mesmo dia: nada passa do teto
    e.addPassXp(50);
    expect(e.state.premiumPass.xp).toBe(GameConfig.pass.dailyXpCap);
    // novo dia: teto reinicia
    e.state.flags.passXpDayStamp = 0;
    e.addPassXp(100);
    expect(e.state.premiumPass.xp).toBe(GameConfig.pass.dailyXpCap + 100);
  });

  it('trilha grátis libera recompensa a cada 5 níveis; premium em todos os níveis', () => {
    for (let lvl = 1; lvl <= 100; lvl++) {
      const def = GAME_PASS_LEVELS[lvl - 1];
      expect(def.premium).toBeDefined();
      if (lvl % 5 === 0) expect(def.free).toBeDefined();
      else expect(def.free).toBeUndefined();
    }
    const e = new GameEngine();
    e.addPassXp(GAME_PASS_LEVELS[4].xp); // nível 5
    expect(e.claimPassFree(3).ok).toBe(false); // sem recompensa free no nível 3
    expect(e.claimPassFree(5).ok).toBe(true);
    expect(e.claimPassFree(4).ok).toBe(false); // nível sem recompensa free
  });

  it('recompensas grátis disponíveis sem premium; premium exige compra', () => {
    const e = new GameEngine();
    e.addPassXp(GAME_PASS_LEVELS[4].xp); // nível 5
    expect(e.premiumPassLevel()).toBe(5);
    expect(e.claimPassFree(5).ok).toBe(true);
    expect(e.claimPassFree(5).ok).toBe(false); // duplicado
    expect(e.claimPassPremium(5).ok).toBe(false); // sem passe
  });

  it('compra do passe libera trilha premium + itens de avatar', async () => {
    const e = new GameEngine();
    const r = await e.buyPremiumPass();
    expect(r.ok).toBe(true);
    expect(e.state.premiumPass.owned).toBe(true);
    expect(e.state.premiumPass.purchaseTimestamp).toBeGreaterThan(0);
    expect(e.state.avatarItems).toContain('fr_premium');
    expect(e.avatarItemAvailable(AVATAR_CATALOG.icons, 'av_cyber')).toBe(true);
    const again = await e.buyPremiumPass();
    expect(again.ok).toBe(false); // já adquirido
    // recompensa premium de nível 20 (título pass_premium) — XP direto (sem teto diário)
    e.state.premiumPass.xp = GAME_PASS_LEVELS[19].xp;
    expect(e.claimPassPremium(20).ok).toBe(true);
    expect(e.state.titles).toContain('pass_premium');
  });

  it('temporada inválida bloqueia reivindicação (validação por temporada)', () => {
    const e = new GameEngine();
    e.state.premiumPass.owned = true;
    e.state.premiumPass.season = 'season_antiga';
    e.addPassXp(GAME_PASS_LEVELS[4].xp);
    expect(e.claimPassPremium(5).ok).toBe(false);
    expect(e.claimPassFree(5).ok).toBe(false);
  });

  it('syncPremiumPassSeason reseta na troca de temporada', () => {
    const e = new GameEngine();
    e.state.premiumPass.owned = true;
    e.state.premiumPass.season = 'season_antiga';
    e.state.premiumPass.xp = 500;
    e.syncPremiumPassSeason();
    expect(e.state.premiumPass.season).toBe(SEASON_ID);
    expect(e.state.premiumPass.xp).toBe(0);
  });

  it('pet exclusivo Cronos concedido no nível 100', () => {
    const e = new GameEngine();
    e.state.premiumPass.owned = true;
    e.state.premiumPass.xp = GAME_PASS_LEVELS[99].xp; // XP direto (teto diário não se aplica)
    expect(e.premiumPassLevel()).toBe(100);
    const r = e.claimPassPremium(100);
    expect(r.ok).toBe(true);
    expect(e.state.pets['pet_chrono']).toBeDefined();
  });
});

describe('Skins ocultas (Update 3.0)', () => {
  it('skin não adquirida = conteúdo oculto (sem nome real)', () => {
    const e = new GameEngine();
    expect(isSkinRevealed(e.state, 'pass_omega')).toBe(false);
    const hidden = hiddenSkins(e.state);
    expect(hidden.length).toBeGreaterThan(0);
    // rótulo misterioso nunca contém o nome real
    for (const h of hidden.slice(0, 5)) {
      expect(mysteryLabel(h.id)).toMatch(/^\?\?\? #\d{3}$/);
      expect(mysteryLabel(h.id)).not.toContain(h.name);
    }
  });

  it('número misterioso é estável por posição no catálogo', () => {
    const a = mysteryLabel('pass_omega');
    const b = mysteryLabel('pass_omega');
    expect(a).toBe(b);
    expect(mysteryLabel('pass_echo')).not.toBe(mysteryLabel('pass_omega'));
  });

  it('desbloquear revela a skin', () => {
    const e = new GameEngine();
    expect(e.isSkinOwned('pass_glitch')).toBe(false);
    e.grantSkin('pass_glitch');
    expect(isSkinRevealed(e.state, 'pass_glitch')).toBe(true);
    expect(e.isSkinOwned('pass_glitch')).toBe(true);
  });

  it('skins do passe mostram recompensa premium quando não reveladas', () => {
    const e = new GameEngine();
    // revealPremiumRewards = false (padrão): não pode ver o conteúdo
    const passSkin = SKINS.find((s) => s.id === 'pass_core')!;
    expect(e.state.settings.revealPremiumRewards).toBe(false);
    expect(premiumLockLabel()).toContain('RECOMPENSA PREMIUM');
    expect(isSkinRevealed(e.state, passSkin.id)).toBe(false);
    // comprando o passe continua oculta até ganhar no nível certo
    e.state.premiumPass.owned = true;
    expect(isSkinRevealed(e.state, passSkin.id)).toBe(false);
    e.grantSkin('pass_core');
    expect(isSkinRevealed(e.state, passSkin.id)).toBe(true);
  });

  it('coleção progressiva: revelar conta, desconhecidas não revelam total', () => {
    const e = new GameEngine();
    const prog = collectionSkinProgress(e.state);
    expect(prog.revealed).toBe(SKINS.filter((s) => isSkinRevealed(e.state, s.id)).length);
    expect(prog.unknown).toBe(SKINS.length - prog.revealed);
    // 'pass_echo' não é revelada por condição de progresso — conceder aumenta a contagem
    const hidden = hiddenSkins(e.state).find((s) => s.id === 'pass_echo');
    expect(hidden).toBeDefined();
    e.grantSkin('pass_echo');
    const prog2 = collectionSkinProgress(e.state);
    expect(prog2.revealed).toBe(prog.revealed + 1);
    expect(prog2.unknown).toBe(prog.unknown - 1);
  });
});

describe('Admin: segurança e permissões (Update 3.0)', () => {
  it('hash de PIN: determinístico com sal, nunca em texto puro', () => {
    const salt = randomSalt();
    expect(hashPin('1234', salt)).toBe(hashPin('1234', salt));
    expect(hashPin('1234', salt)).not.toBe(hashPin('4321', salt));
    const stored = { salt, hash: hashPin('1234', salt), createdAt: Date.now() };
    expect(verifyPin(stored, '1234')).toBe(true);
    expect(verifyPin(stored, '0000')).toBe(false);
    expect(verifyPin(null, '1234')).toBe(false);
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12')).toBe(false);
  });

  it('permissões granulares por papel', () => {
    expect(roleHas('SUPER_ADMIN', 'DELETE_EVENTS')).toBe(true);
    expect(roleHas('MODERATOR', 'DELETE_EVENTS')).toBe(false);
    expect(roleHas('CONTENT_MANAGER', 'CREATE_EVENTS')).toBe(true);
    expect(roleHas('CONTENT_MANAGER', 'VIEW_AUDIT')).toBe(false);
    expect(roleHas('SUPPORT', 'GRANT_REWARDS')).toBe(true);
    expect(roleHas('SUPPORT', 'EDIT_SKINS')).toBe(false);
    expect(rolesHave(['SUPER_ADMIN', 'ADMIN'], 'VIEW_USERS')).toBe(true);
    // todos os papéis existem e têm pelo menos VIEW_ADMIN ou DEBUG_GAME
    for (const r of ADMIN_ROLES) {
      expect(roleHas(r, 'VIEW_ADMIN') || roleHas(r, 'DEBUG_GAME')).toBe(true);
    }
    expect(ALL_PERMISSIONS.length).toBeGreaterThanOrEqual(15);
  });

  it('login/PIN local (não persiste credencial em texto puro)', () => {
    expect(hasAdminPin()).toBe(false);
    expect(setupAdminPin('abc').ok).toBe(false); // curto demais
    expect(setupAdminPin('1234').ok).toBe(true);
    expect(hasAdminPin()).toBe(true);
    expect(setupAdminPin('5678').ok).toBe(false); // já configurado
    expect(loginAdmin('0000').ok).toBe(false);
    expect(loginAdmin('1234').ok).toBe(true);
    expect(isAdminLoggedIn()).toBe(true);
    logoutAdmin();
    expect(isAdminLoggedIn()).toBe(false);
    // o valor armazenado NUNCA contém o PIN
    const raw = mem.get('nc_admin_pin_v1') ?? '';
    expect(raw).not.toContain('1234');
  });

  it('auditoria registra ações', () => {
    audit({ actor: 'SUPER_ADMIN', action: 'EVENT_PUBLISH', target: 'ev:teste', detail: 'rascunho → publicado', result: 'ok' });
    audit({ actor: 'SUPER_ADMIN', action: 'PERMISSION_DENIED', target: 'skin:x', detail: 'tentativa sem permissão', result: 'denied' });
    const logs = auditLog();
    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe('PERMISSION_DENIED');
    clearAuditLogs();
    expect(auditLog().length).toBe(0);
    expect(securityLogEntries().length).toBe(0);
  });
});

describe('Admin: validação e ciclo de conteúdo (Update 3.0)', () => {
  it('validação rejeita preço negativo, datas invertidas e XP negativa', () => {
    const base: AdminContent = {
      id: 'ev_teste', kind: 'event', name: 'Teste', status: 'DRAFT',
      payload: {}, createdAt: 1, updatedAt: 1, version: 1,
    };
    expect(validateContent({ ...base, payload: { price: -5 } }).ok).toBe(false);
    expect(validateContent({ ...base, payload: { price: 0 } }).ok).toBe(true);
    expect(validateContent({ ...base, payload: { startAt: 200, endAt: 100 } }).ok).toBe(false);
    expect(validateContent({ ...base, payload: { xp: -1 } }).ok).toBe(false);
    expect(validateContent({ ...base, payload: { reward: { gold: 'abc' } } }).ok).toBe(false);
    expect(validateContent({ ...base, payload: { reward: { gold: '1000' } } }).ok).toBe(true);
  });

  it('rascunho → publicar nunca publica por acidente', () => {
    const draft: AdminContent = {
      id: 'ev_ciclo', kind: 'event', name: 'Ciclo de vida', status: 'DRAFT',
      payload: { price: 100 }, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    };
    expect(saveDraft(draft).ok).toBe(true);
    expect(loadContent().length).toBe(1);
    expect(loadContent()[0].status).toBe('DRAFT');
    expect(publishContent('ev_ciclo', 'event').ok).toBe(true);
    expect(loadContent()[0].status).toBe('PUBLISHED');
    expect(loadContent()[0].publishedAt).toBeGreaterThan(0);
  });

  it('backup automático antes de alteração e restore', () => {
    const draft: AdminContent = {
      id: 'b1', kind: 'banner', name: 'Banner Teste', status: 'DRAFT',
      payload: {}, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    };
    saveDraft(draft);
    const bk = autoBackup();
    expect(bk.count).toBe(1);
    expect(backupList().length).toBeGreaterThan(0);
    // apaga e restaura
    publishContent('b1', 'banner');
    expect(loadContent()[0].status).toBe('PUBLISHED');
    const key = backupList()[0];
    expect(restoreBackup(key).ok).toBe(true);
    expect(loadContent()[0].status).toBe('DRAFT');
  });
});

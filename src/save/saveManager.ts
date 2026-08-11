import { GameEngine } from '../game/engine';
import { SAVE_VERSION, type GameState, type RunRecord } from '../game/types';
import { migrateSave } from './migrations';
import { validateState } from './validation';
import { hashStr, sanitizeString } from '../core/utils';

export const SAVE_SLOTS = ['slot1', 'slot2', 'slot3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

export const SAVE_PREFIX = 'NC1.';

interface SaveFile {
  version: number;
  schemaVersion: number;
  data: GameState;
  checksum: string;
  savedAt: number;
}

interface SlotMeta {
  slot: SaveSlot;
  exists: boolean;
  name: string;
  level: number;
  playTime: number;
  prestige: number;
  savedAt: number | null;
}

/**
 * Camada de armazenamento: Electron (arquivos) → localStorage (navegador) → memória (testes).
 */
const memoryStore = new Map<string, string>();

export const storage = {
  async get(slot: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.api) return window.api.saveGet(slot);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(`nc_${slot}`);
    return memoryStore.get(`nc_${slot}`) ?? null;
  },
  async set(slot: string, data: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.api) return window.api.saveSet(slot, data);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`nc_${slot}`, data);
      return true;
    }
    memoryStore.set(`nc_${slot}`, data);
    return true;
  },
  async del(slot: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.api) return window.api.saveDelete(slot);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`nc_${slot}`);
      return true;
    }
    memoryStore.delete(`nc_${slot}`);
    return true;
  },
  async getSettings(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.api) return window.api.settingsGet();
    if (typeof localStorage !== 'undefined') return localStorage.getItem('nc_settings');
    return memoryStore.get('nc_settings') ?? null;
  },
  async setSettings(data: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.api) return window.api.settingsSet(data);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nc_settings', data);
      return true;
    }
    memoryStore.set('nc_settings', data);
    return true;
  },
  async backupCreate(slot: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.api) return window.api.backupCreate(slot);
    return null;
  },
  async backupList(): Promise<string[]> {
    if (typeof window !== 'undefined' && window.api) return window.api.backupList();
    return [];
  },
  async backupRestore(name: string, slot: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.api) return window.api.backupRestore(name, slot);
    return false;
  },
  async backupDelete(name: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.api) return window.api.backupDelete(name);
    return false;
  },
  async openDataDir(): Promise<string> {
    if (typeof window !== 'undefined' && window.api) return window.api.openDataDir();
    return '';
  },
};

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class SaveManager {
  private slot: SaveSlot = 'slot1';
  private timer: ReturnType<typeof setInterval> | null = null;

  setSlot(slot: SaveSlot): void {
    this.slot = slot;
  }

  getSlot(): SaveSlot {
    return this.slot;
  }

  private encode(state: GameState): string {
    const payload = JSON.stringify(state);
    const checksum = hashStr(payload);
    const file: SaveFile = {
      version: 1,
      schemaVersion: state.schemaVersion,
      data: state,
      checksum,
      savedAt: Date.now(),
    };
    return SAVE_PREFIX + toBase64(JSON.stringify(file));
  }

  private decode(text: string): SaveFile {
    if (!text.startsWith(SAVE_PREFIX)) throw new Error('Formato de save inválido');
    const raw = fromBase64(text.slice(SAVE_PREFIX.length));
    const file = JSON.parse(raw) as SaveFile;
    if (!file || file.version !== 1 || !file.data) throw new Error('Save corrompido');
    const checksum = hashStr(JSON.stringify(file.data));
    if (checksum !== file.checksum) throw new Error('Checksum inválido — save corrompido ou adulterado');
    return file;
  }

  async save(engine: GameEngine): Promise<boolean> {
    try {
      const text = this.encode(engine.state);
      return await storage.set(this.slot, text);
    } catch (err) {
      console.error('Falha ao salvar:', err);
      return false;
    }
  }

  async load(slot?: SaveSlot): Promise<{ engine: GameEngine; fixed: string[] } | null> {
    const target = slot ?? this.slot;
    try {
      const text = await storage.get(target);
      if (!text) return null;
      const file = this.decode(text);
      // migrações de versão
      const migrated = migrateSave(file.data);
      // validação + correções anti-corrupção
      const { state, result } = validateState(migrated);
      state.schemaVersion = SAVE_VERSION;
      this.setSlot(target);
      const engine = new GameEngine(state);
      return { engine, fixed: result.fixed };
    } catch (err) {
      console.error('Falha ao carregar:', err);
      return null;
    }
  }

  async delete(slot: SaveSlot): Promise<boolean> {
    return storage.del(slot);
  }

  /** Lê o ranking local de um slot (para o leaderboard entre saves) — nunca lança. */
  async readRanking(slot: SaveSlot): Promise<{ name: string; ranking: RunRecord[] } | null> {
    try {
      const text = await storage.get(slot);
      if (!text) return null;
      const file = this.decode(text);
      const migrated = migrateSave(file.data);
      const name = sanitizeString(migrated.name, 30) || 'Jogador';
      const ranking = Array.isArray(migrated.ranking) ? migrated.ranking.filter((r) => r && typeof r === 'object') : [];
      return { name, ranking };
    } catch {
      return null;
    }
  }

  async listSlots(): Promise<SlotMeta[]> {
    const metas: SlotMeta[] = [];
    for (const slot of SAVE_SLOTS) {
      try {
        const text = await storage.get(slot);
        if (!text) {
          metas.push({ slot, exists: false, name: '—', level: 1, playTime: 0, prestige: 0, savedAt: null });
          continue;
        }
        const file = this.decode(text);
        metas.push({
          slot,
          exists: true,
          name: sanitizeString(file.data.name, 30) || 'Jogador',
          level: file.data.level,
          playTime: file.data.playTimeSeconds,
          prestige: file.data.prestige.count,
          savedAt: file.savedAt,
        });
      } catch {
        metas.push({ slot, exists: false, name: '—', level: 1, playTime: 0, prestige: 0, savedAt: null });
      }
    }
    return metas;
  }

  /**
   * Liga o auto-save (a cada `minutes`). `onSave` é chamado após cada save
   * local bem-sucedido — usado para empurrar o save para a nuvem na hora.
   */
  startAutoSave(engine: GameEngine, minutes: number, onSave?: (engine: GameEngine) => void): void {
    this.stopAutoSave();
    const ms = Math.max(0.25, minutes) * 60 * 1000;
    this.timer = setInterval(() => {
      void this.save(engine).then((ok) => {
        if (ok) onSave?.(engine);
      });
    }, ms);
  }

  stopAutoSave(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Exporta o save como string (base64) — pronto para copiar. */
  exportText(engine: GameEngine): string {
    return this.encode(engine.state);
  }

  /** Importa um save de string externa. */
  async importText(slot: SaveSlot, text: string): Promise<{ ok: boolean; reason?: string; fixed?: string[] }> {
    try {
      const file = this.decode(text.trim());
      const migrated = migrateSave(file.data);
      const { state, result } = validateState(migrated);
      state.schemaVersion = SAVE_VERSION;
      await storage.set(slot, this.encode(state));
      return { ok: true, fixed: result.fixed };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'Importação falhou' };
    }
  }

  async exportToFile(engine: GameEngine): Promise<{ ok: boolean; reason?: string }> {
    if (!window.api) {
      // navegador: download
      const blob = new Blob([this.exportText(engine)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nucleo-save-${this.slot}.ncsave`;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    }
    const path = await window.api.dialogSave(`nucleo-save-${this.slot}.ncsave`);
    if (!path) return { ok: false, reason: 'Cancelado' };
    const ok = await window.api.fsWrite(path, this.exportText(engine));
    return ok ? { ok: true } : { ok: false, reason: 'Falha ao escrever arquivo' };
  }

  async importFromFile(slot: SaveSlot): Promise<{ ok: boolean; reason?: string; fixed?: string[] }> {
    if (!window.api) {
      return { ok: false, reason: 'Disponível apenas no app desktop' };
    }
    const path = await window.api.dialogOpen();
    if (!path) return { ok: false, reason: 'Cancelado' };
    const text = await window.api.fsRead(path);
    if (!text) return { ok: false, reason: 'Falha ao ler arquivo' };
    return this.importText(slot, text);
  }

  async createBackup(engine: GameEngine): Promise<string | null> {
    // garante que o save atual está gravado antes do backup
    await this.save(engine);
    return storage.backupCreate(this.slot);
  }

  async listBackups(): Promise<string[]> {
    return storage.backupList();
  }

  async restoreBackup(name: string): Promise<boolean> {
    return storage.backupRestore(name, this.slot);
  }

  async deleteBackup(name: string): Promise<boolean> {
    return storage.backupDelete(name);
  }

  async openDataDir(): Promise<string> {
    return storage.openDataDir();
  }
}

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function userDataDir(): string {
  return app.getPath('userData');
}

function savesDir(): string {
  const dir = path.join(userDataDir(), 'saves');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function backupsDir(): string {
  const dir = path.join(userDataDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// slots locais (`slot1-3`) ou slots com escopo de conta (`acct_<user>_slot1-3`)
const SLOT_RE = /^(?:slot[1-3]|acct_[a-z0-9_]{1,20}_slot[1-3])$/;

function safeSlot(slot: string): string {
  if (!SLOT_RE.test(slot)) throw new Error('slot inválido');
  return slot;
}

function safeName(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('nome inválido');
  return name;
}

// ── auto-update (GitHub Releases via electron-updater) ──
function sendUpdaterEvent(payload: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:event', payload);
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    // em dev não há instalador — o renderer mostra apenas a versão
    sendUpdaterEvent({ type: 'dev' });
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdaterEvent({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdaterEvent({ type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) => sendUpdaterEvent({ type: 'not-available', version: info.version }));
  autoUpdater.on('download-progress', (p) =>
    sendUpdaterEvent({ type: 'progress', percent: Math.round(p.percent), transferred: p.transferred, total: p.total }),
  );
  autoUpdater.on('update-downloaded', (info) => sendUpdaterEvent({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => sendUpdaterEvent({ type: 'error', message: String(err?.message ?? err) }));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#070b16',
    title: 'Núcleo Clicker',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('save:get', (_e, slot: string) => {
    try {
      const file = path.join(savesDir(), `${safeSlot(slot)}.json`);
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error('save:get error', err);
      return null;
    }
  });

  ipcMain.handle('save:set', (_e, slot: string, data: string) => {
    try {
      const file = path.join(savesDir(), `${safeSlot(slot)}.json`);
      fs.writeFileSync(file, data, 'utf8');
      return true;
    } catch (err) {
      console.error('save:set error', err);
      return false;
    }
  });

  ipcMain.handle('save:delete', (_e, slot: string) => {
    try {
      const file = path.join(savesDir(), `${safeSlot(slot)}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return true;
    } catch (err) {
      console.error('save:delete error', err);
      return false;
    }
  });

  ipcMain.handle('settings:get', () => {
    try {
      const file = path.join(userDataDir(), 'settings.json');
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:set', (_e, data: string) => {
    try {
      fs.writeFileSync(path.join(userDataDir(), 'settings.json'), data, 'utf8');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('backup:create', (_e, slot: string) => {
    try {
      const file = path.join(savesDir(), `${safeSlot(slot)}.json`);
      if (!fs.existsSync(file)) return null;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(backupsDir(), `${safeSlot(slot)}-${stamp}.json`);
      fs.copyFileSync(file, dest);
      return path.basename(dest);
    } catch {
      return null;
    }
  });

  ipcMain.handle('backup:list', () => {
    try {
      return fs.readdirSync(backupsDir()).filter((f) => f.endsWith('.json')).sort().reverse();
    } catch {
      return [];
    }
  });

  ipcMain.handle('backup:restore', (_e, name: string, slot: string) => {
    try {
      const src = path.join(backupsDir(), safeName(name));
      if (!fs.existsSync(src)) return false;
      const dest = path.join(savesDir(), `${safeSlot(slot)}.json`);
      fs.copyFileSync(src, dest);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('backup:delete', (_e, name: string) => {
    try {
      const src = path.join(backupsDir(), safeName(name));
      if (fs.existsSync(src)) fs.unlinkSync(src);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('data:dir', async () => {
    const dir = userDataDir();
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('dialog:save', async (_e, suggestedName: string) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: 'Exportar save',
      defaultPath: suggestedName,
      filters: [{ name: 'Save do Núcleo Clicker', extensions: ['ncsave'] }],
    });
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle('dialog:open', async () => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: 'Importar save',
      properties: ['openFile'],
      filters: [{ name: 'Save do Núcleo Clicker', extensions: ['ncsave', 'json', 'txt'] }],
    });
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });

  ipcMain.handle('fs:write', (_e, filePath: string, data: string) => {
    try {
      fs.writeFileSync(filePath, data, 'utf8');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:read', (_e, filePath: string) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  });

  // ── auto-update ──
  ipcMain.handle('updater:getVersion', () => ({ version: app.getVersion(), channel: app.isPackaged ? 'stable' : 'dev' }));

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'Disponível apenas na versão instalada' };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, updateAvailable: Boolean(r?.updateInfo?.version), version: r?.updateInfo?.version };
    } catch (err) {
      return { ok: false, reason: String(err instanceof Error ? err.message : err) };
    }
  });

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'Disponível apenas na versão instalada' };
    try {
      void autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err instanceof Error ? err.message : err) };
    }
  });

  ipcMain.handle('updater:install', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'Disponível apenas na versão instalada' };
    autoUpdater.quitAndInstall();
    return { ok: true };
  });
}

app.whenReady().then(() => {
  registerIpc();
  setupAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

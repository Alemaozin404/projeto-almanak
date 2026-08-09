import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const api = {
  isElectron: true,
  saveGet: (slot: string): Promise<string | null> => ipcRenderer.invoke('save:get', slot),
  saveSet: (slot: string, data: string): Promise<boolean> => ipcRenderer.invoke('save:set', slot, data),
  saveDelete: (slot: string): Promise<boolean> => ipcRenderer.invoke('save:delete', slot),
  settingsGet: (): Promise<string | null> => ipcRenderer.invoke('settings:get'),
  settingsSet: (data: string): Promise<boolean> => ipcRenderer.invoke('settings:set', data),
  backupCreate: (slot: string): Promise<string | null> => ipcRenderer.invoke('backup:create', slot),
  backupList: (): Promise<string[]> => ipcRenderer.invoke('backup:list'),
  backupRestore: (name: string, slot: string): Promise<boolean> => ipcRenderer.invoke('backup:restore', name, slot),
  backupDelete: (name: string): Promise<boolean> => ipcRenderer.invoke('backup:delete', name),
  openDataDir: (): Promise<string> => ipcRenderer.invoke('data:dir'),
  dialogSave: (name: string): Promise<string | null> => ipcRenderer.invoke('dialog:save', name),
  dialogOpen: (): Promise<string | null> => ipcRenderer.invoke('dialog:open'),
  fsWrite: (filePath: string, data: string): Promise<boolean> => ipcRenderer.invoke('fs:write', filePath, data),
  fsRead: (filePath: string): Promise<string | null> => ipcRenderer.invoke('fs:read', filePath),
  updater: {
    getVersion: (): Promise<{ version: string; channel: string }> => ipcRenderer.invoke('updater:getVersion'),
    check: (): Promise<{ ok: boolean; updateAvailable?: boolean; version?: string; reason?: string }> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('updater:install'),
    onEvent: (cb: (payload: UpdaterEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: UpdaterEvent) => cb(payload);
      ipcRenderer.on('updater:event', listener);
      return () => ipcRenderer.removeListener('updater:event', listener);
    },
  },
};

export interface UpdaterEvent {
  type: 'dev' | 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;

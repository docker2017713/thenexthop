import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, PlayerControlAction, PlayerState } from '../shared/ipc';
import { LoginPayload, SettingsUpdate } from '../shared/types';

console.log('Preload script loading...');

const api = {
  login(payload: LoginPayload) {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN, payload);
  },
  logout() {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGOUT);
  },
  getSession() {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION);
  },
  getSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },
  updateSettings(update: SettingsUpdate) {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, update);
  },
  clearCredentials() {
    return ipcRenderer.invoke(IPC_CHANNELS.CLEAR_CREDENTIALS);
  },
  control(action: PlayerControlAction) {
    return ipcRenderer.invoke(IPC_CHANNELS.CONTROL, action);
  },
  onPlayerState(callback: (state: PlayerState) => void) {
    const handler = (_event: Electron.IpcRendererEvent, state: PlayerState) => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.PLAYER_STATE, handler);
    ipcRenderer.send(IPC_CHANNELS.SUBSCRIBE_PLAYER_STATE);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PLAYER_STATE, handler);
      ipcRenderer.send(IPC_CHANNELS.UNSUBSCRIBE_PLAYER_STATE);
    };
  },
  openAudioStation() {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_AUDIO_STATION);
  },
  updateLayoutHeader(height: number) {
    ipcRenderer.send(IPC_CHANNELS.UPDATE_LAYOUT_HEADER, height);
  },
  openSystemPreferences() {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_SYSTEM_PREFERENCES);
  },
  testNetworkConnection(url: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.TEST_NETWORK_CONNECTION, url);
  }
};

const electronAPI = {
  on: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  removeListener: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  }
};

console.log('Exposing audioStation API to main world...');
contextBridge.exposeInMainWorld('audioStation', api);
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('audioStation API exposed successfully');
console.log('electronAPI exposed:', electronAPI);

ipcRenderer.on('inject-api', () => {
  console.log('Received inject-api event, re-exposing preload bindings');
  contextBridge.exposeInMainWorld('audioStation', api);
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
});

export type PreloadApi = typeof api;
export type ElectronApi = typeof electronAPI;

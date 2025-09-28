import type { PreloadApi } from '../main/preload';
import type { PlayerState } from '../shared/ipc';

declare global {
  interface Window {
    audioStation: PreloadApi & {
      onPlayerState(callback: (state: PlayerState) => void): () => void;
      updateLayoutHeader?(height: number): void;
      openSystemPreferences?(): Promise<boolean>;
      testNetworkConnection?(url: string): Promise<{ success: boolean; error?: string; status?: number; statusText?: string }>;
    };
    electronAPI?: {
      on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void): void;
      removeListener(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void): void;
    };
  }
}

export {};

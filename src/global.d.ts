import type { PreloadApi, ElectronApi } from './main/preload';

declare global {
  interface Window {
    audioStation?: PreloadApi;
    electronAPI?: ElectronApi;
  }
}

export {};

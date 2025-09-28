import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { existsSync } from 'node:fs';
import * as electron from 'electron';
const { app, BrowserWindow, BrowserView, ipcMain, Tray, Menu, nativeImage, Notification, globalShortcut } = electron;
import Store from 'electron-store';
import fetch, { Headers, RequestInit } from 'node-fetch';
import keytar from 'keytar';

import { IPC_CHANNELS, PlayerControlAction, PlayerState } from '../shared/ipc';
import { LoginPayload, SessionInfo, Settings, SettingsUpdate } from '../shared/types';
import { getTrayTranslations, getMenuTranslations } from './i18n';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_DEV_PATH = path.join(__dirname, '../../dist/preload/preload.js');
const PRELOAD_PROD_PATH = path.join(__dirname, '../../dist/preload/preload.js');
const PRELOAD_PATH = PRELOAD_DEV_PATH;
const RENDERER_DEV_URL = 'http://localhost:5173';
const RENDERER_HTML_PATH = path.join(__dirname, '../../dist/renderer/index.html');
const KEYCHAIN_SERVICE = 'SynologyAudioStationDesktop';
const KEYCHAIN_ACCOUNT = 'default';

const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  username: '',
  ignoreCertificateErrors: false,
  notifications: true,
  mediaKeys: true,
  theme: 'system',
  language: 'en',
  autoLogoutMinutes: 0,
  showInTray: true,
  keepRunningInBackground: true,
  startMinimized: false,
  globalShortcuts: {
    playPause: 'Cmd+Option+P',
    nextTrack: 'Cmd+Option+Right',
    previousTrack: 'Cmd+Option+Left'
  }
};

type StoreSchema = {
  settings: Settings;
  session?: SessionInfo;
};

type PlayerSubscriber = Electron.WebContents;

type SynologyResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: number;
  };
};


type LoginResponse = SynologyResponse<{
  sid: string;
}>;

type RemotePlayerStatusResponse = SynologyResponse<{
  timeline?: {
    state?: PlayerState['status'];
    duration?: number;
    position?: number;
  };
  song?: {
    title?: string;
    additional?: {
      song_tag?: {
        album?: string;
        artist?: string;
      };
      song_audio?: {
        cover?: string;
      };
    };
  };
  player?: {
    player_id?: string;
  };
}>;

type RemotePlayerActionResponse = SynologyResponse<Record<string, unknown>>;

const PLAYER_CONTROL_SCRIPTS: Record<'play' | 'pause' | 'stop' | 'next' | 'previous', string> = {
  play: '(() => { const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main"); scope?.audioPlayer?.doPlay?.(); })();',
  pause: '(() => { const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main"); scope?.audioPlayer?.doPause?.(); })();',
  stop: '(() => { const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main"); scope?.audioPlayer?.doStop?.(); })();',
  next: '(() => { const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main"); scope?.audioPlayer?.doNext?.(); })();',
  previous: '(() => { const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main"); scope?.audioPlayer?.doPrevious?.(); })();'
};

class AudioStationClient {
  private session?: SessionInfo;
  private ignoreCertificateErrors = false;
  private playerId: string | null = 'default';

  setSession(session?: SessionInfo) {
    this.session = session;
  }

  getSession() {
    return this.session;
  }

  setIgnoreCertificateErrors(ignore: boolean) {
    this.ignoreCertificateErrors = ignore;
  }

  private async getAvailablePlayerId(forceRefresh = false): Promise<string> {
    if (!this.session) {
      throw new Error('No active session');
    }

    if (!forceRefresh && this.playerId) {
      return this.playerId;
    }

    const resolveFromStatus = async (): Promise<string> => {
      const params = new URLSearchParams({
        api: 'SYNO.AudioStation.RemotePlayerStatus',
        method: 'getstatus',
        version: '3'
      });
      const url = this.buildUrl(this.session!.baseUrl, '/webapi/AudioStation/remote_player_status.cgi', params);
      const response = await this.fetch(url, { method: 'GET' }, this.ignoreCertificateErrors);
      const json = (await response.json()) as RemotePlayerStatusResponse;
      const candidate = json.data?.player?.player_id;
      return candidate || 'default';
    };

    const params = new URLSearchParams({
      api: 'SYNO.AudioStation.RemotePlayer',
      method: 'list',
      version: '3'
    });

    const url = this.buildUrl(this.session.baseUrl, '/webapi/AudioStation/remote_player.cgi', params);
    const response = await this.fetch(url, { method: 'GET' }, this.ignoreCertificateErrors);

    interface PlayerListResponse {
      success: boolean;
      data?: {
        players?: Array<{
          id?: string;
          isdefault?: boolean;
          state?: string;
        }>;
      };
      error?: { code?: number };
    }

    const list = (await response.json()) as PlayerListResponse;

    if (!list.success || !list.data?.players?.length) {
      const fallback = await resolveFromStatus();
      console.warn('Unable to resolve player list, using status fallback:', fallback, list.error);
      this.playerId = fallback;
      return this.playerId;
    }

    const preferred =
      list.data.players.find((player) => player.isdefault) ??
      list.data.players.find((player) => player.state !== 'stopped') ??
      list.data.players[0];

    this.playerId = preferred.id ?? 'default';
    return this.playerId;
  }

  async login(payload: LoginPayload): Promise<SessionInfo> {
    const { baseUrl, username, password, otpCode, ignoreCertificateErrors } = payload;
    
    // Auto-detect if this is a local/private IP and should ignore certificate errors
    // Extract just the hostname part for checking
    const urlObj = new URL(baseUrl);
    const hostname = urlObj.hostname;
    const isLocalUrl = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname);
    // Always ignore certificate errors for local IPs, regardless of user setting
    const shouldIgnoreCert = isLocalUrl || (ignoreCertificateErrors === true);
    
    console.log('Login attempt:', { baseUrl, hostname, isLocalUrl, shouldIgnoreCert, ignoreCertificateErrors });
    
    // Force ignore certificate errors for local IPs
    if (isLocalUrl) {
      console.log('Forcing certificate ignore for local IP:', hostname);
    }

    const params = new URLSearchParams({
      api: 'SYNO.API.Auth',
      version: '3',
      method: 'login',
      account: username,
      passwd: password,
      session: 'AudioStation',
      format: 'cookie'
    });

    if (otpCode) {
      params.set('otp_code', otpCode);
    }

    const url = this.buildUrl(baseUrl, '/webapi/auth.cgi', params);
    console.log('Making request to:', url, 'with ignoreCert:', shouldIgnoreCert);
    let text: string;
    try {
      const response = await this.fetch(url, { method: 'GET' }, shouldIgnoreCert, 10_000);
      text = await response.text();
      console.log('Login raw response:', text);
    } catch (error) {
      console.error('Login request failed for base', baseUrl, error);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    let body: LoginResponse;
    try {
      body = JSON.parse(text) as LoginResponse;
    } catch (error) {
      console.error('Failed to parse login response JSON', error);
      throw new Error('Invalid response from Synology API');
    }

    if (!body.success || !body.data?.sid) {
      const errorCode = body?.error?.code;
      const error = this.mapLoginError(errorCode);
      throw new Error(error);
    }

    const sid: string = body.data.sid;
    const session: SessionInfo = {
      username,
      baseUrl,
      sid,
      expiresAt: Date.now() + 1000 * 60 * 30
    };

    this.session = session;
    this.ignoreCertificateErrors = shouldIgnoreCert;
    this.playerId = 'default';
    return session;
  }

  logout() {
    console.log('AudioStationClient: clearing session');
    this.session = undefined;
    this.playerId = 'default';
  }

  async getPlayerState(): Promise<PlayerState> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const playerId = await this.getAvailablePlayerId();

    const params = new URLSearchParams({
      api: 'SYNO.AudioStation.RemotePlayerStatus',
      method: 'getstatus',
      version: '3',
      player_id: playerId
    });

    const url = this.buildUrl(this.session.baseUrl, '/webapi/AudioStation/remote_player_status.cgi', params);
    const response = await this.fetch(url, { method: 'GET' }, this.ignoreCertificateErrors);
    const json = (await response.json()) as RemotePlayerStatusResponse;

    if (!json.success) {
      throw new Error('Unable to fetch player status');
    }

    const data = json.data;
    if (!data) {
      throw new Error('Player status payload missing');
    }

    if (data.player?.player_id) {
      this.playerId = data.player.player_id;
    }

    const status = data.timeline?.state as PlayerState['status'];

    const song = data.song;

    const coverPath: string | undefined = song?.additional?.song_audio?.cover;

    return {
      status: status ?? 'stopped',
      trackTitle: song?.title,
      albumTitle: song?.additional?.song_tag?.album,
      artistName: song?.additional?.song_tag?.artist,
      coverUrl: coverPath ? this.ensureAbsoluteUrl(this.session.baseUrl, coverPath) : undefined,
      durationMs: (data.timeline?.duration ?? 0) * 1000,
      positionMs: (data.timeline?.position ?? 0) * 1000
    };
  }

  async control(action: PlayerControlAction) {
    if (!this.session) {
      throw new Error('No active session');
    }

    const session = this.session;
    const currentPlayerId = await this.getAvailablePlayerId();

    const params = new URLSearchParams({
      api: 'SYNO.AudioStation.RemotePlayer',
      method: 'control',
      id: currentPlayerId
    });

    switch (action.type) {
      case 'play':
        params.set('version', '2');
        params.set('action', 'play');
        params.set('value', '0');
        break;
      case 'pause':
        params.set('version', '3');
        params.set('action', 'pause');
        break;
      case 'stop':
        params.set('version', '3');
        params.set('action', 'stop');
        break;
      case 'next':
        params.set('version', '3');
        params.set('action', 'next');
        break;
      case 'previous':
        params.set('version', '3');
        params.set('action', 'prev');
        break;
      case 'seek':
        params.set('version', '3');
        params.set('action', 'seek');
        params.set('value', String(Math.floor(action.positionMs / 1000)));
        break;
      default:
        throw new Error('Unsupported action');
    }

    const getControlUrl = () => this.buildUrl(session.baseUrl, '/webapi/AudioStation/remote_player.cgi', params);

    const attemptControl = async (force = false) => {
      if (force) {
        const refreshedId = await this.getAvailablePlayerId(true);
        params.set('id', refreshedId);
      }

      const response = await this.fetch(getControlUrl(), { method: 'POST' }, this.ignoreCertificateErrors);
      const text = await response.text();

      let json: RemotePlayerActionResponse;
      try {
        json = JSON.parse(text) as RemotePlayerActionResponse;
      } catch (error) {
        console.error('Player control response is not valid JSON:', text, error);
        throw new Error('Unable to execute player command');
      }

      if (!json.success) {
        if (json.error?.code === 101 && !force) {
          console.warn('Player control failed with code 101, refreshing player id');
          return attemptControl(true);
        }

        console.error('Player control request failed', {
          url: getControlUrl(),
          params: Object.fromEntries(params.entries()),
          response: json
        });
        throw new Error('Unable to execute player command');
      }

      return json;
    };

    await attemptControl();
  }

  private async fetch(url: string, init?: RequestInit, overrideIgnore?: boolean, timeoutMs = 0) {
    const ignore = overrideIgnore ?? this.ignoreCertificateErrors;
    const agent = url.startsWith('https')
      ? new https.Agent({ rejectUnauthorized: !ignore })
      : undefined;
    const headers = new Headers(init?.headers ?? {});

    if (this.session?.sid) {
      headers.set('Cookie', `id=${this.session.sid};`);
    }

    const controller = timeoutMs > 0 ? new AbortController() : null;
    let timeout: NodeJS.Timeout | undefined;

    if (controller) {
      timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        agent,
        signal: controller?.signal
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private buildUrl(base: string, endpoint: string, params: URLSearchParams) {
    let cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    // 不自动添加端口，使用用户提供的完整URL
    return `${cleanBase}${endpoint}?${params.toString()}`;
  }

  ensureAbsoluteUrl(base: string, resource: string) {
    if (/^https?:/i.test(resource)) {
      return resource;
    }
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    if (resource.startsWith('/')) {
      return `${cleanBase}${resource}`;
    }
    return `${cleanBase}/${resource}`;
  }

  private mapLoginError(code?: number) {
    switch (code) {
      case 400:
        return 'Authentication failed: incorrect credentials or OTP required';
      case 401:
        return 'Authentication failed: incorrect credentials or OTP required';
      case 402:
        return 'Account disabled';
      case 403:
        return 'Permission denied';
      case 404:
        return 'Insufficient privileges';
      case 406:
        return 'OTP code required';
      default:
        return 'Unable to login – please verify NAS address and credentials';
    }
  }
}

class AppController {
  private window: electron.BrowserWindow | null = null;
  private tray: electron.Tray | null = null;
  private audioView: electron.BrowserView | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private subscribers = new Set<PlayerSubscriber>();
  private lastKnownState: PlayerState | null = null;
  private isQuiting = false;
  private settingsWindow: electron.BrowserWindow | null = null;
  private rendererHeaderHeight = 75;

  private resolveAssetIcon(...candidates: string[]): string | null {
    const searchRoots = [
      path.join(__dirname, '../assets'),
      path.join(__dirname, '../../src/assets'),
      path.join(__dirname, '../../assets')
    ];

    for (const name of candidates) {
      for (const root of searchRoots) {
        const candidatePath = path.join(root, name);
        if (existsSync(candidatePath)) {
          return candidatePath;
        }
      }
    }

    return null;
  }

  private store = new Store<StoreSchema>({
    name: 'app-config',
    defaults: {
      settings: DEFAULT_SETTINGS
    }
  });

  private client = new AudioStationClient();
  private autoLogoutTimer: NodeJS.Timeout | null = null;

  private async tryExecutePlayerScript(action: PlayerControlAction['type']): Promise<boolean> {
    if (!this.audioView) {
      return false;
    }

    if (action === 'seek') {
      return false;
    }

    const script = PLAYER_CONTROL_SCRIPTS[action as keyof typeof PLAYER_CONTROL_SCRIPTS];
    if (!script) {
      return false;
    }

    try {
      await this.audioView.webContents.executeJavaScript(script, true);
      return true;
    } catch (error) {
      console.warn('Player control script failed', action, error);
      return false;
    }
  }

  private clearAutoLogoutTimer() {
    if (this.autoLogoutTimer) {
      clearTimeout(this.autoLogoutTimer);
      this.autoLogoutTimer = null;
    }
  }

  private scheduleAutoLogout() {
    this.clearAutoLogoutTimer();

    const minutes = this.getSettings().autoLogoutMinutes;
    if (!minutes || minutes <= 0) {
      return;
    }

    const session = this.store.get('session');
    if (!session) {
      return;
    }

    this.autoLogoutTimer = setTimeout(() => {
      void this.performLogout({ reason: 'timeout', clearCredentials: false, focusWindow: true });
    }, minutes * 60_000);
  }

  private async performLogout(options: {
    reason: 'manual' | 'timeout' | 'credentials';
    clearCredentials: boolean;
    focusWindow?: boolean;
    notifyRenderer?: boolean;
  }) {
    this.clearAutoLogoutTimer();

    await this.forcePausePlayback();

    try {
      this.client.logout();
    } catch (error) {
      console.error('Client logout failed', error);
    }

    try {
      this.store.delete('session');
    } catch (error) {
      console.error('Failed to delete session from store', error);
    }

    if (options.clearCredentials) {
      try {
        await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      } catch (error) {
        console.error('Failed to delete password from keytar', error);
      }
    }

    if (options.notifyRenderer !== false) {
      this.window?.webContents.send('session-expired', options.reason);
      this.window?.webContents.send('session-cleared', {
        language: this.getSettings().language
      });
    }

    if (this.audioView && this.window) {
      this.window.removeBrowserView(this.audioView);
      this.audioView = null;
    }

    if (!options.clearCredentials) {
      const currentSettings = this.getSettings();
      this.window?.webContents.send('session-reset-form', {
        baseUrl: currentSettings.baseUrl,
        username: currentSettings.username,
        language: currentSettings.language
      });
      this.window?.webContents.send('settings-updated', currentSettings);
    }

    if (options.focusWindow) {
      const windowRef = this.window;
      if (windowRef && !windowRef.isDestroyed()) {
        if (windowRef.isMinimized()) {
          windowRef.restore();
        }
        windowRef.show();
        windowRef.focus();
      }
    }

    this.createMenu();
    this.updateTrayMenu();
  }

  private async forcePausePlayback() {
    try {
      await this.tryExecutePlayerScript('pause');
      await this.tryExecutePlayerScript('stop');
    } catch (error) {
      console.warn('Pause script failed during logout', error);
    }

    try {
      await this.client.control({ type: 'pause' });
      await this.client.control({ type: 'stop' });
    } catch (error) {
      console.warn('Pause via API failed during logout', error);
    }
  }

  private getSettings(): Settings {
    const stored = this.store.get('settings', DEFAULT_SETTINGS);
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      globalShortcuts: {
        ...DEFAULT_SETTINGS.globalShortcuts,
        ...stored.globalShortcuts
      }
    };
    const normalized = this.normalizeSettings(merged);
    if (normalized !== merged) {
      this.store.set('settings', normalized);
    }
    return normalized;
  }

  private normalizeSettings(settings: Settings): Settings {
    const updated: Settings = {
      ...settings,
      globalShortcuts: { ...settings.globalShortcuts }
    };

    updated.startMinimized = false;

    const legacyDefaults = {
      playPause: 'MediaPlayPause',
      nextTrack: 'MediaNextTrack',
      previousTrack: 'MediaPreviousTrack'
    } as const;

    let changed = false;

    (Object.keys(legacyDefaults) as Array<keyof typeof legacyDefaults>).forEach((key) => {
      if (updated.globalShortcuts[key] === legacyDefaults[key]) {
        updated.globalShortcuts[key] = DEFAULT_SETTINGS.globalShortcuts[key];
        changed = true;
      }
    });

    return changed ? updated : settings;
  }

  async init() {
    await this.ensureSingleInstance();
    this.bootstrapAppEvents();
    await app.whenReady();

    const settings = this.getSettings();
    this.client.setIgnoreCertificateErrors(settings.ignoreCertificateErrors);

    this.setupCertificateHandling();
    this.registerIpc();
    this.createMainWindow();
    this.createTrayIfNeeded(true);
    this.applyGlobalShortcuts(settings);
    this.restoreSession();
    this.startPolling();
  }

  private async ensureSingleInstance() {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
    }

    app.on('second-instance', () => {
      if (this.window) {
        if (this.window.isMinimized()) {
          this.window.restore();
        }
        this.window.focus();
      }
    });
  }

  private bootstrapAppEvents() {
    app.on('activate', () => {
      if (this.window) {
        if (this.window.isMinimized()) {
          this.window.restore();
        }
        if (!this.window.isVisible()) {
          this.window.show();
        }
        this.window.focus();
        return;
      }

      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.isQuiting = true;
      this.stopPolling();
      this.unregisterShortcuts();
    });
  }

  private createMainWindow() {
    if (this.window) {
      return;
    }

    console.log('Creating main window with preload path:', PRELOAD_PATH);
    console.log('Preload file exists:', require('fs').existsSync(PRELOAD_PATH));

    const currentSettings = this.getSettings();
    const windowIconPath = this.resolveAssetIcon('appIcon.png', 'appIcon.ico', 'trayTemplate.png');
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'Synology Music Player',
      icon:
        process.platform === 'linux' || process.platform === 'win32'
          ? windowIconPath ?? undefined
          : undefined,
      show: true,
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
      frame: process.platform === 'darwin' ? false : true,
      trafficLightPosition: process.platform === 'darwin' ? { x: 20, y: 20 } : undefined,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    };

    this.window = new BrowserWindow(windowOptions);

    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isVisible()) {
        this.window.show();
      }
    });
    if (process.platform === 'darwin') {
      console.log('=== DOCK ICON DEBUG ===');
      console.log('App object:', app);
      console.log('App.dock:', app?.dock);
      
      // Try to set a simple dock icon
      try {
        const dockIconPath = this.resolveAssetIcon('appIcon-512.png', 'appIcon.icns', 'trayTemplate.png');
        console.log('Icon path:', dockIconPath);
        
        if (dockIconPath) {
          const dockIcon = nativeImage.createFromPath(dockIconPath);
          console.log('Icon loaded, isEmpty:', dockIcon.isEmpty());
          console.log('Icon size:', dockIcon.getSize());
          
          if (!dockIcon.isEmpty() && app?.dock) {
            app.dock.setIcon(dockIcon);
            console.log('✅ Dock icon set successfully!');
          } else {
            console.warn('❌ Failed to set dock icon - icon empty or dock not available');
          }
        } else {
          console.warn('❌ Icon file not found');
        }
      } catch (error) {
        console.warn('❌ Error setting dock icon:', error);
      }
      console.log('=== END DOCK ICON DEBUG ===');
    }

    // Create application menu
    this.createMenu();

    if (app.isPackaged) {
      this.window.loadFile(RENDERER_HTML_PATH);
    } else {
      this.window.loadURL(RENDERER_DEV_URL);
      if (process.env.OPEN_DEVTOOLS === 'true') {
        this.window.webContents.openDevTools({ mode: 'detach' });
      }
    }
    
    // Ensure the main window content is visible
    this.window.webContents.on('did-finish-load', () => {
      console.log('Main window loaded, ensuring visibility');
      this.window?.webContents.setVisualZoomLevelLimits(1, 1);
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    // Handle window close - minimize to tray instead of quitting
    this.window.on('close', (event: Electron.Event) => {
      const settings = this.getSettings();
      const shouldBackground =
        settings.keepRunningInBackground && settings.showInTray && !this.isQuiting && this.tray;
      if (shouldBackground) {
        event.preventDefault();
        this.window?.hide();
        console.log('Window minimized to system tray');
        // Show a notification that the app is still running
        if (process.platform === 'darwin') {
          const notification = new Notification({
            title: 'Synology Music Player',
            body: 'App is running in the background. Use Cmd+W to restore window or check the system tray.',
            silent: false
          });
          notification.show();
        }
      } else {
        console.log('Quitting application');
      }
    });

    // Add event listeners for debugging
    this.window.webContents.on('did-finish-load', () => {
      console.log('Window finished loading');
    });

    this.window.webContents.on('preload-error', (_event: Electron.Event, preloadPath: string, error: Error) => {
      console.error('Preload script error:', preloadPath, error);
    });

    this.window.webContents.on(
      'console-message',
      (_event: Electron.Event, _level: number, message: string, _line: number, sourceId: string) => {
        if (sourceId === 'preload') {
          console.log(`[PRELOAD] ${message}`);
        }
      }
    );
  }

  private ensureAudioStationView() {
    if (!this.window || this.audioView) {
      console.log('Audio view already exists or window not ready');
      return;
    }

    console.log('Creating Audio Station view...');
    this.audioView = new BrowserView({
      webPreferences: {
        partition: 'persist:audio-station',
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.audioView.setBackgroundColor('#00000000');

    this.window.setBrowserView(this.audioView);
    this.resizeAudioView();
    this.window.on('resize', () => this.resizeAudioView());

    this.audioView.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, callback) => {
        const url = details.url;

        if (url.includes('webapi/auth.cgi')) {
          const query = new URL(url).searchParams;
          const method = query.get('method');

          if (method?.toLowerCase() === 'logout') {
            console.log('Detected Synology logout via query string');
            void this.performLogout({ reason: 'manual', clearCredentials: false, focusWindow: true });
            callback({ cancel: true });
            return;
          } else if (details.uploadData && details.uploadData.length > 0) {
            const body = Buffer.concat(
              details.uploadData
                .map((item) => (item.bytes ? Buffer.from(item.bytes) : Buffer.from('')))
                .filter((buffer) => buffer.length > 0)
            ).toString('utf8');
            if (/method=logout/i.test(body)) {
              console.log('Detected Synology logout via POST body');
              void this.performLogout({ reason: 'manual', clearCredentials: false, focusWindow: true });
              callback({ cancel: true });
              return;
            }
          }
        }

        callback({});
      }
    );

    console.log('Audio Station view created and attached to window');

    // Set up session cookies for the web view
    this.setupWebViewSession();
    
    // Ensure the main window content stays on top
    this.window.webContents.on('did-finish-load', () => {
      // Inject CSS to ensure our app interface is always visible
      this.window?.webContents.insertCSS(`
        .app-shell {
          position: relative !important;
          z-index: 10000 !important;
        }
        .app-header {
          position: relative !important;
          z-index: 10001 !important;
        }
        .settings-overlay {
          position: fixed !important;
          z-index: 99999 !important;
        }
      `);
    });
  }

  private async setupWebViewSession() {
    if (!this.audioView) return;
    
    const session = this.client.getSession();
    if (session?.sid) {
      const baseUrl = session.baseUrl.replace(/\/$/, '');
      const url = new URL(baseUrl);
      
      // Set multiple cookie variations to ensure compatibility
      const cookies = [
        {
          url: baseUrl,
          name: 'id',
          value: session.sid,
          domain: url.hostname,
          path: '/',
          secure: baseUrl.startsWith('https'),
          httpOnly: true
        },
        {
          url: baseUrl,
          name: 'id',
          value: session.sid,
          domain: '.' + url.hostname, // Also try with dot prefix
          path: '/',
          secure: baseUrl.startsWith('https'),
          httpOnly: true
        },
        {
          url: `${baseUrl}/audio/`,
          name: 'id',
          value: session.sid,
          domain: url.hostname,
          path: '/',
          secure: baseUrl.startsWith('https'),
          httpOnly: true
        }
      ];
      
      try {
        for (const cookie of cookies) {
          await this.audioView.webContents.session.cookies.set(cookie);
          console.log('Session cookie set:', cookie.name, 'for', cookie.url);
        }
        console.log('All session cookies set for web view');
      } catch (error) {
        console.error('Failed to set session cookie for web view:', error);
      }
    }
  }

  private resizeAudioView() {
    if (!this.window || !this.audioView) {
      console.log('Cannot resize audio view - window or audioView not ready');
      return;
    }

    const bounds = this.window.getContentBounds();
    const headerHeight = Math.max(0, this.rendererHeaderHeight || 0);
    const height = Math.max(0, bounds.height - headerHeight);
    console.log('Resizing audio view to:', { x: 0, y: headerHeight, width: bounds.width, height });
    this.audioView.setBounds({
      x: 0,
      y: headerHeight,
      width: bounds.width,
      height
    });

    if (this.window) {
      this.window.setTopBrowserView(this.audioView);
    }
  }

  private trayInitialized = false;

  private createTrayIfNeeded(force = false) {
    if (!force && this.trayInitialized) {
      return;
    }

    if (this.tray) {
      this.updateTrayMenu();
      return;
    }

    try {
      const iconPath = path.join(__dirname, '../assets/trayTemplate.png');
      console.log('Tray icon path:', iconPath);
      console.log('Tray icon exists:', existsSync(iconPath));
      
      let trayIcon: Electron.NativeImage | undefined;
      if (existsSync(iconPath)) {
        const loadedIcon = nativeImage.createFromPath(iconPath);
        const { width, height } = loadedIcon.getSize();
        if (!loadedIcon.isEmpty() && width >= 16 && height >= 16) {
          trayIcon = loadedIcon.resize({ width: 22, height: 22, quality: 'best' });
        } else {
          console.warn('Tray icon file is too small or empty, falling back to generated icon');
        }
      } else {
        console.warn('Tray icon file not found, creating simple icon');
      }

      if (!trayIcon) {
        const iconData = Buffer.from(`
          <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
            <rect width="22" height="22" rx="4" fill="#4c6ef5"/>
            <text x="11" y="16" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="white">S</text>
          </svg>
        `);
        trayIcon = nativeImage.createFromBuffer(iconData);
      }

      if (process.platform === 'darwin' && !iconPath.toLowerCase().endsWith('.png')) {
        trayIcon.setTemplateImage(true);
      }

      this.tray = new Tray(trayIcon);
      console.log('Tray created successfully');

      // Set tooltip
      this.tray.setToolTip('Synology Music Player');

      // For macOS 15+, we need to ensure the tray is visible
      if (process.platform === 'darwin') {
        // Force the tray to be visible
        this.tray.setIgnoreDoubleClickEvents(true);
        console.log('Tray configured for macOS');
      }

      this.trayInitialized = true;
      this.updateTrayMenu();

      // On macOS, keep the window state; expose actions via context menu only
      if (process.platform === 'darwin') {
        this.tray.on('click', () => {
          console.log('Tray clicked (macOS) – showing context menu');
          this.tray?.popUpContextMenu();
        });
      } else {
        // On other platforms, use right-click for context menu
        this.tray.on('click', () => {
          console.log('Tray clicked (other platform) – showing context menu');
          this.tray?.popUpContextMenu();
        });
      }
    } catch (error) {
      console.error('Failed to create tray:', error);
      // On macOS 13+, tray creation might fail due to permissions
      if (process.platform === 'darwin') {
        console.log('Tray creation failed on macOS - this might be due to system permissions');
        console.log('Please check System Preferences > Security & Privacy > Privacy > Accessibility');
      }
    }
  }

  private updateTrayMenu() {
    if (!this.tray) return;

    const state = this.lastKnownState;
    const isPlaying = state?.status === 'playing';

    const isSessionActive = Boolean(this.client.getSession());
    const settings = this.getSettings();
    const shortcuts = settings.globalShortcuts;
    const t = getTrayTranslations(settings.language);

    const controlItems: Electron.MenuItemConstructorOptions[] = isSessionActive
      ? [
          {
            label: t.showWindow,
            accelerator: 'Cmd+W',
            click: () => this.window?.show()
          },
          {
            label: isPlaying ? t.pause : t.play,
            accelerator: shortcuts.playPause,
            click: () => this.togglePlayback()
          },
          {
            label: t.nextTrack,
            accelerator: shortcuts.nextTrack,
            click: () => this.handlePlayerControl({ type: 'next' })
          },
          {
            label: t.previousTrack,
            accelerator: shortcuts.previousTrack,
            click: () => this.handlePlayerControl({ type: 'previous' })
          },
          { type: 'separator' as const }
        ]
      : [
          {
            label: t.signInToEnableControls,
            enabled: false
          },
          { type: 'separator' as const }
        ];

    const contextMenu = Menu.buildFromTemplate([
      ...controlItems,
      {
        label: t.quit,
        click: () => {
          this.isQuiting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip(t.tooltip);
  }

  private registerIpc() {
    ipcMain.handle(IPC_CHANNELS.LOGIN, async (_event, payload: LoginPayload) => {
      const session = await this.client.login(payload);
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, payload.password);

      // Auto-detect if this is a local/private IP and should ignore certificate errors
      const isLocalUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(payload.baseUrl);
      const shouldIgnoreCert = isLocalUrl || payload.ignoreCertificateErrors === true;

      const settings = this.getSettings();
      const nextSettings: Settings = {
        ...settings,
        baseUrl: payload.baseUrl,
        username: payload.username,
        ignoreCertificateErrors: shouldIgnoreCert
      };
      this.store.set('settings', nextSettings);
      this.store.set('session', session);
      this.client.setSession(session);
      this.client.setIgnoreCertificateErrors(shouldIgnoreCert);

      await this.loadAudioStationView();
      this.scheduleAutoLogout();
      this.createMenu();
      this.updateTrayMenu();
      this.window?.webContents.send('settings-updated', nextSettings);
      return session;
    });

    ipcMain.handle(IPC_CHANNELS.LOGOUT, async () => {
      await this.performLogout({ reason: 'manual', clearCredentials: true, focusWindow: true });
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.GET_SESSION, async () => {
      return this.store.get('session');
    });

    ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
      return this.getSettings();
    });

    ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, async (_event, update: SettingsUpdate) => {
      const current = this.getSettings();
      const next: Settings = {
        ...current,
        ...update,
        globalShortcuts: {
          ...current.globalShortcuts,
          ...update.globalShortcuts
        }
      };

      if (!next.showInTray) {
        next.keepRunningInBackground = false;
        next.startMinimized = false;
      }

      this.store.set('settings', next);
      this.client.setIgnoreCertificateErrors(next.ignoreCertificateErrors);
      this.applyGlobalShortcuts(next);
      this.createTrayIfNeeded(true);
      this.window?.webContents.send('settings-updated', next);
      this.settingsWindow?.webContents.send('settings-updated', next);
      
      // 如果语言设置发生变化，立即更新托盘菜单和菜单栏
      if (update.language && update.language !== current.language) {
        this.updateTrayMenu();
        this.createMenu();
      }
      
      this.scheduleAutoLogout();
      return next;
    });

    ipcMain.handle(IPC_CHANNELS.CLEAR_CREDENTIALS, async () => {
      await this.performLogout({ reason: 'credentials', clearCredentials: true, focusWindow: true });
      return true;
    });

    ipcMain.on(IPC_CHANNELS.UPDATE_LAYOUT_HEADER, (_event, height: number) => {
      const nextHeight = Math.max(0, Math.round(height));
      console.log('[Main] header height received', nextHeight, 'previous', this.rendererHeaderHeight);

      if (nextHeight === 0) {
        this.rendererHeaderHeight = 75;
        this.resizeAudioView();
        return;
      }

      if (Math.abs(this.rendererHeaderHeight - nextHeight) <= 1) {
        this.rendererHeaderHeight = nextHeight;
        return;
      }

      this.rendererHeaderHeight = nextHeight;
      this.resizeAudioView();
    });

    ipcMain.on(IPC_CHANNELS.SUBSCRIBE_PLAYER_STATE, (event: Electron.IpcMainEvent) => {
      const webContents = event.sender;
      this.subscribers.add(webContents);
      if (this.lastKnownState) {
        webContents.send(IPC_CHANNELS.PLAYER_STATE, this.lastKnownState);
      }
      webContents.once('destroyed', () => {
        this.subscribers.delete(webContents);
      });
    });

    ipcMain.on(IPC_CHANNELS.UNSUBSCRIBE_PLAYER_STATE, (event: Electron.IpcMainEvent) => {
      this.subscribers.delete(event.sender);
    });

    ipcMain.handle(IPC_CHANNELS.CONTROL, async (_event, action: PlayerControlAction) => {
      await this.handlePlayerControl(action);
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_AUDIO_STATION, async () => {
      if (!this.client) {
        return false;
      }
      this.window?.show();
      await this.loadAudioStationView(true);
      this.scheduleAutoLogout();
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_SYSTEM_PREFERENCES, async () => {
      if (process.platform === 'darwin') {
        const { exec } = require('child_process');
        exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy"');
      }
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.TEST_NETWORK_CONNECTION, async (_event, url: string) => {
      try {
        const response = await fetch(url, { 
          method: 'HEAD',
          timeout: 5000 
        });
        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
  }

  private async handlePlayerControl(action: PlayerControlAction) {
    try {
      const handledViaScript = await this.tryExecutePlayerScript(action.type);

      if (!handledViaScript) {
        await this.client.control(action);
      }

      this.scheduleAutoLogout();

      await this.refreshPlayerState();
    } catch (error) {
      console.error('Player control failed', error);
    }
  }

  private async refreshPlayerState() {
    const session = this.client.getSession();
    if (!session) {
      return;
    }

    const script = `(() => {
      const scope = SYNO?.SDS?.AudioStation?.Window?.getPanelScope?.("SYNO.SDS.AudioStation.Main");
      const player = scope?.audioPlayer;
      if (!player) {
        return null;
      }

      const scopeState = scope?.core?.state;
      const nowPlaying = scopeState?.player?.nowplaying || player.nowPlaying || player.nowplaying || {};
      const song = nowPlaying.song || nowPlaying.track || {};

      const title = song.title || nowPlaying.title || null;
      const artist = song.artist || song.additional?.song_tag?.artist || nowPlaying.artist || null;
      const album = song.album || song.additional?.song_tag?.album || nowPlaying.album || null;
      const cover = song.additional?.song_audio?.cover || nowPlaying.cover || null;

      const duration =
        scopeState?.player?.duration ??
        nowPlaying.duration ??
        (player.getDuration ? player.getDuration() : player.duration) ??
        null;

      const position =
        scopeState?.player?.position ??
        (player.getPosition ? player.getPosition() : player.position) ??
        null;

      const state =
        scopeState?.player?.state ??
        (player.isPlaying?.() ? 'playing' : null) ??
        (player.isPaused?.() ? 'paused' : null) ??
        (player.isStopped?.() ? 'stopped' : null);

      return {
        state,
        title,
        artist,
        album,
        cover,
        duration,
        position
      };
    })();`;

    let refreshed = false;

    if (this.audioView) {
      try {
        const result = await this.audioView.webContents.executeJavaScript(script, true);
        if (result) {
          const mapped: PlayerState = {
            status: (result.state as PlayerState['status']) || 'stopped',
            trackTitle: result.title || undefined,
            artistName: result.artist || undefined,
            albumTitle: result.album || undefined,
            coverUrl:
              result.cover
                ? this.client.ensureAbsoluteUrl(session.baseUrl, result.cover)
                : undefined,
            durationMs: result.duration != null ? Number(result.duration) * 1000 : undefined,
            positionMs: result.position != null ? Number(result.position) * 1000 : undefined
          };

          this.broadcastPlayerState(mapped);
          refreshed = true;
        }
      } catch (error) {
        console.warn('Failed to refresh state via injected script', error);
      }
    }

    if (!refreshed) {
      try {
        const state = await this.client.getPlayerState();
        this.broadcastPlayerState(state);
      } catch (stateError) {
        console.warn('Unable to refresh player state via API', stateError);
      }
    }
  }

  private togglePlayback() {
    if (this.lastKnownState?.status === 'playing') {
      void this.handlePlayerControl({ type: 'pause' });
    } else {
      void this.handlePlayerControl({ type: 'play' });
    }
  }

  private async restoreSession() {
    const session = this.store.get('session');
    if (!session) {
      console.log('No saved session found');
      return;
    }

    console.log('Found saved session, attempting to restore...');
    const password = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (!password) {
      console.log('No saved password found');
      return;
    }

    try {
      console.log('Attempting to restore session for:', session.username, 'at', session.baseUrl);
      const refreshed = await this.client.login({
        baseUrl: session.baseUrl,
        username: session.username,
        password,
        ignoreCertificateErrors: this.getSettings().ignoreCertificateErrors
      });
      this.store.set('session', refreshed);
      console.log('Session restored successfully, loading Audio Station view...');
      // Force load the Audio Station view when restoring session
      await this.loadAudioStationView(true);
      this.scheduleAutoLogout();
    } catch (error) {
      console.error('Auto login failed', error);
      // Clear the invalid session
      this.store.delete('session');
      console.log('Cleared invalid session');
      // Force the renderer to show login screen
      this.window?.webContents.send('session-expired');
    }
  }

  private async loadAudioStationView(force = false) {
    const session = this.store.get('session');
    if (!session) {
      console.log('loadAudioStationView called but no session exists');
      return;
    }

    console.log('loadAudioStationView called, session exists, force:', force);
    
    this.ensureAudioStationView();
    if (!this.audioView || !this.window) {
      console.log('Failed to create audio view or window not ready');
      return;
    }

    const targetUrl = session.baseUrl;

    if (!force && this.audioView.webContents.getURL().startsWith(targetUrl)) {
      console.log('Audio Station already loaded, skipping');
      return;
    }

    // Ensure session is set up before loading
    await this.setupWebViewSession();
    
    // Wait a bit for cookies to be set
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('Loading Audio Station URL:', targetUrl);
    
    // Check if cookies were set correctly
    const cookieOrigin = new URL(targetUrl).origin;
    const cookies = await this.audioView.webContents.session.cookies.get({ url: cookieOrigin });
    console.log('Current cookies for', cookieOrigin, ':', cookies.map((c) => `${c.name}=${c.value}`));
    
    // Add event listeners for debugging and UI cleanup
    this.audioView.webContents.once('did-finish-load', () => {
      console.log('Audio Station web view loaded successfully');
      console.log('Current URL:', this.audioView?.webContents.getURL());
      void this.customizeAudioStationView();
      void this.refreshPlayerState();
    });
    
    this.audioView.webContents.on(
      'did-fail-load',
      (_event: Electron.Event, errorCode: number, errorDescription: string) => {
        console.error('Audio Station web view failed to load:', errorCode, errorDescription);
      }
    );
    
    this.audioView.webContents.on('did-start-loading', () => {
      console.log('Audio Station web view started loading...');
    });
    
    console.log('About to load URL:', targetUrl);
    this.audioView.webContents.loadURL(targetUrl, {
      userAgent: 'Synology-Audio-Station-Desktop'
    });
  }

  private startPolling() {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(async () => {
      try {
        await this.refreshPlayerState();
      } catch (error) {
        // Silent failure when session missing
      }
    }, 4000);
  }

  private stopPolling() {
    if (!this.pollInterval) {
      return;
    }

    clearInterval(this.pollInterval);
    this.pollInterval = null;
  }

  private broadcastPlayerState(state: PlayerState) {
    this.notifyOnTrackChange(state);
    this.subscribers.forEach((contents) => {
      if (!contents.isDestroyed()) {
        contents.send(IPC_CHANNELS.PLAYER_STATE, state);
      }
    });
    this.lastKnownState = state;
    this.updateTrayMenu(); // Update tray menu with new state
  }

  private async customizeAudioStationView() {
    if (!this.audioView) {
      return;
    }

    const hideChromeCss = `
      .syno-appbar__item--signout,
      .syno-appbar__user,
      .sds-appbar__item--signout,
      .sds-appbar__user,
      .sds-appbar__actions,
      .sds-appbar__dropdown,
      .sds-appbar__menu
      { display: none !important; }

      .sds-appbar { display: flex !important; }
    `;

    try {
      await this.audioView.webContents.insertCSS(hideChromeCss);
    } catch (error) {
      console.warn('Failed to inject Audio Station CSS overrides:', error);
    }

    const sanitizeChromeScript = `(() => {
      const hideElements = () => {
        document
          .querySelectorAll(
            '.syno-appbar__item--signout, .syno-appbar__user, .sds-appbar__item--signout, .sds-appbar__user, .sds-appbar__actions, .sds-appbar__dropdown, .sds-appbar__menu'
          )
          .forEach((el) => el.remove());

        const signOut = Array.from(document.querySelectorAll('a, button')).find((el) =>
          /sign\s*out/i.test((el.textContent || '').trim())
        );
        if (signOut) {
          signOut.remove();
        }
      };

      hideElements();
      const observer = new MutationObserver(() => {
        hideElements();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();`;

    try {
      await this.audioView.webContents.executeJavaScript(sanitizeChromeScript, true);
    } catch (error) {
      console.warn('Failed to inject Audio Station cleanup script:', error);
    }
  }

  private describeState(state: PlayerState) {
    if (state.status === 'playing') {
      return `${state.trackTitle ?? 'Unknown'} — ${state.artistName ?? ''}`.trim();
    }
    return 'Synology Music Player';
  }

  private async notifyOnTrackChange(state: PlayerState) {
    if (!this.getSettings().notifications) {
      return;
    }

    if (this.lastKnownState?.trackTitle === state.trackTitle) {
      return;
    }

    if (!state.trackTitle) {
      return;
    }

    // Create notification with album cover if available
    const notificationOptions: Electron.NotificationConstructorOptions = {
      title: state.trackTitle,
      body: state.artistName ? `${state.artistName} — ${state.albumTitle ?? ''}` : '',
      silent: true
    };

    // Add album cover if available
    if (state.coverUrl) {
      try {
        // Download the album cover image
        const response = await fetch(state.coverUrl);
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer();
          const imageData = Buffer.from(imageBuffer);
          const image = nativeImage.createFromBuffer(imageData);
          
          // Resize image for notification (macOS notifications work best with smaller images)
          const resizedImage = image.resize({ width: 64, height: 64 });
          notificationOptions.icon = resizedImage;
        }
      } catch (error) {
        console.log('Failed to load album cover for notification:', error);
      }
    }

    const notification = new Notification(notificationOptions);
    notification.show();
  }

  private applyGlobalShortcuts(settings: Settings) {
    this.unregisterShortcuts();

    if (!settings.mediaKeys) {
      return;
    }

    const controls: Array<[string, () => void]> = [
      [settings.globalShortcuts.playPause, () => this.togglePlayback()],
      [settings.globalShortcuts.nextTrack, () => void this.handlePlayerControl({ type: 'next' })],
      [settings.globalShortcuts.previousTrack, () => void this.handlePlayerControl({ type: 'previous' })]
    ];

    controls.forEach(([accelerator, handler]) => {
      if (!accelerator) {
        return;
      }
      try {
        const registered = globalShortcut.register(accelerator, handler);
        if (!registered) {
          console.warn(`Failed to register shortcut ${accelerator} - may be already in use by another application`);
        } else {
          console.log(`Successfully registered shortcut ${accelerator}`);
        }
      } catch (error) {
        console.warn(`Error registering shortcut ${accelerator}:`, error);
      }
    });
  }

  private unregisterShortcuts() {
    globalShortcut.unregisterAll();
  }

  private setupCertificateHandling() {
    app.on(
      'certificate-error',
      (
        event: Electron.Event,
        _webContents: Electron.WebContents,
        url: string,
        error: string,
        _certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => {
        event.preventDefault();
        const settings = this.getSettings();
        
        // Auto-accept self-signed certificates for local/private IPs
        const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const isLocalUrl = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname);
      
      console.log('Certificate error:', { url, isLocalUrl, ignoreCertificateErrors: settings.ignoreCertificateErrors });
      
      if (settings.ignoreCertificateErrors || isLocalUrl) {
        console.log('Accepting certificate for local/private URL:', url);
        callback(true);
      } else {
        console.warn('Certificate error for public URL:', error, url);
        callback(false);
      }
      }
    );
  }

  private createSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 600,
      height: 550,
      resizable: true,
      minimizable: true,
      maximizable: false,
      show: false,
      parent: this.window || undefined,
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
      frame: process.platform === 'darwin' ? false : true,
      trafficLightPosition: process.platform === 'darwin' ? { x: 20, y: 20 } : undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    // Set window name for settings detection
    this.settingsWindow.setTitle('Settings - Synology Music Player');

    // Load the settings page with a query flag so the renderer can boot straight into settings view
    const settingsUrl = path.join(__dirname, '../renderer/index.html');
    console.log('Loading settings URL:', settingsUrl);
    this.settingsWindow.loadFile(settingsUrl, { query: { view: 'settings' } });

    // Explicitly flag this renderer context as the standalone settings window
    this.settingsWindow.webContents.once('did-finish-load', () => {
      this.settingsWindow?.webContents.executeJavaScript(`
        window.isStandaloneSettings = true;
        console.log('Standalone settings window flag injected');
      `);
    });

    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow?.show();
      console.log('Settings window opened');
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
      console.log('Settings window closed');
    });

    // Set up IPC for settings window
    this.setupSettingsWindowIPC();

    // Seed the renderer with the API bridge if preload is ready but context was restored from disk.
    this.settingsWindow.webContents.once('dom-ready', () => {
      this.settingsWindow?.webContents.send('inject-api');
    });
  }

  private setupSettingsWindowIPC() {
    if (!this.settingsWindow) return;

    // Remove existing handlers first to avoid duplicate registration
    ipcMain.removeHandler('settings/get');
    ipcMain.removeHandler('settings/update');
    ipcMain.removeHandler('settings/logout');

    // Handle settings operations in the settings window
    ipcMain.handle('settings/get', async () => {
      return this.getSettings();
    });

    ipcMain.handle('settings/update', async (_, update: SettingsUpdate) => {
      const currentSettings = this.getSettings();
      const newSettings: Settings = { 
        ...currentSettings, 
        ...update,
        globalShortcuts: {
          ...currentSettings.globalShortcuts,
          ...update.globalShortcuts
        }
      };
      this.store.set('settings', newSettings);
      
      // Apply global shortcuts if they changed
      if (update.globalShortcuts) {
        this.applyGlobalShortcuts(newSettings);
      }

      this.window?.webContents.send('settings-updated', newSettings);
      this.settingsWindow?.webContents.send('settings-updated', newSettings);
      
      return newSettings;
    });

    ipcMain.handle('settings/logout', async () => {
      console.log('Settings window: Logout requested');
      this.client.logout();
      this.store.delete('session');
      await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      this.settingsWindow?.close();
    });
  }

  private createMenu() {
    const hasSession = Boolean(this.client.getSession());
    const settings = this.getSettings();
    const t = getMenuTranslations(settings.language);

    if (process.platform === 'darwin') {
      app.setName(t.appName);
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: t.appName,
        submenu: [
          {
            label: t.about,
            role: 'about'
          },
          { type: 'separator' },
          ...(
            hasSession
              ? [
                  {
                    label: t.settings,
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                      console.log('Menu: Settings clicked, opening settings window');
                      this.createSettingsWindow();
                    }
                  },
                  { type: 'separator' as const },
                  {
                    label: t.signOut,
                    accelerator: 'CmdOrCtrl+Shift+L',
                    click: () => {
                      console.log('Menu: Sign Out clicked, sending logout event');
                      this.window?.webContents.send('logout');
                    }
                  },
                  { type: 'separator' as const }
                ]
              : []
          ),
          {
            label: t.quit,
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              this.isQuiting = true;
              app.quit();
            }
          }
        ]
      },
      {
        label: t.edit,
        submenu: [
          {
            label: t.undo,
            accelerator: 'CmdOrCtrl+Z',
            role: 'undo'
          },
          {
            label: t.redo,
            accelerator: 'Shift+CmdOrCtrl+Z',
            role: 'redo'
          },
          { type: 'separator' as const },
          {
            label: t.cut,
            accelerator: 'CmdOrCtrl+X',
            role: 'cut'
          },
          {
            label: t.copy,
            accelerator: 'CmdOrCtrl+C',
            role: 'copy'
          },
          {
            label: t.paste,
            accelerator: 'CmdOrCtrl+V',
            role: 'paste'
          },
          {
            label: t.selectAll,
            accelerator: 'CmdOrCtrl+A',
            role: 'selectAll'
          }
        ]
      },
      {
        label: t.view,
        submenu: [
          {
            label: t.reload,
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              this.window?.webContents.reload();
            }
          },
          {
            label: t.toggleDeveloperTools,
            accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
            click: () => {
              this.window?.webContents.toggleDevTools();
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private updateAutoLaunch(settings: Settings) {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      try {
        app.setLoginItemSettings({
          openAtLogin: settings.autoLaunch
        });
        console.log(`Auto-launch ${settings.autoLaunch ? 'enabled' : 'disabled'}`);
      } catch (error) {
        console.warn('Failed to update auto-launch settings:', error);
      }
    }
    // Linux auto-launch support can be implemented via systemd/XDG in the future.
  }
}

const controller = new AppController();
controller.init().catch((error) => {
  console.error('Application failed to start', error);
  app.quit();
});

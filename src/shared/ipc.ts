export const IPC_CHANNELS = {
  LOGIN: 'auth/login',
  LOGOUT: 'auth/logout',
  GET_SESSION: 'auth/session',
  GET_SETTINGS: 'settings/get',
  UPDATE_SETTINGS: 'settings/update',
  CLEAR_CREDENTIALS: 'settings/clear-credentials',
  CONTROL: 'player/control',
  PLAYER_STATE: 'player/state',
  SUBSCRIBE_PLAYER_STATE: 'player/subscribe',
  UNSUBSCRIBE_PLAYER_STATE: 'player/unsubscribe',
  OPEN_AUDIO_STATION: 'view/open-audio-station',
  UPDATE_LAYOUT_HEADER: 'layout/update-header',
  OPEN_SYSTEM_PREFERENCES: 'system/open-preferences',
  TEST_NETWORK_CONNECTION: 'network/test-connection'
} as const;

export type PlayerControlAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number };

export type PlayerState = {
  status: 'stopped' | 'playing' | 'paused';
  trackTitle?: string;
  albumTitle?: string;
  artistName?: string;
  coverUrl?: string;
  durationMs?: number;
  positionMs?: number;
};

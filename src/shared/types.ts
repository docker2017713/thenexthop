export type LoginPayload = {
  baseUrl: string;
  username: string;
  password: string;
  otpCode?: string;
  ignoreCertificateErrors?: boolean;
};

export type SessionInfo = {
  username: string;
  baseUrl: string;
  sid: string;
  expiresAt: number;
};

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'en' | 'zh';

export type Settings = {
  baseUrl: string;
  username: string;
  ignoreCertificateErrors: boolean;
  notifications: boolean;
  mediaKeys: boolean;
  theme: ThemePreference;
  language: LanguagePreference;
  autoLogoutMinutes: number;
  autoLaunch?: boolean;
  showInTray?: boolean;
  keepRunningInBackground?: boolean;
  startMinimized?: boolean;
  globalShortcuts: {
    playPause: string;
    nextTrack: string;
    previousTrack: string;
  };
};

export type SettingsUpdate = Partial<Omit<Settings, 'globalShortcuts'>> & {
  globalShortcuts?: Partial<Settings['globalShortcuts']>;
};

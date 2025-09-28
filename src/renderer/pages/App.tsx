import { useEffect, useMemo, useRef, useState } from 'react';
import type { IpcRendererEvent } from 'electron';
import type { PlayerState } from '../../shared/ipc';
import type { LoginPayload, Settings, SettingsUpdate } from '../../shared/types';
import type { PreloadApi } from '../../main/preload';
import { useI18n } from '../hooks/useI18n';

type AudioStationApi = PreloadApi;

const DEFAULT_PLAYER_STATE: PlayerState = {
  status: 'stopped'
};

const isValidSynologyUrl = (value: string): boolean => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_PLAYER_STATE);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);
  const [networkError, setNetworkError] = useState<string>('');
  const [loginCountdown, setLoginCountdown] = useState<number | null>(null);
  const [loginForm, setLoginForm] = useState({
    baseUrl: '',
    username: '',
    password: '',
    otpCode: '',
    ignoreCertificateErrors: false
  });
  
  const { t } = useI18n(settings);
  const headerRef = useRef<HTMLElement | null>(null);
  const trimmedBaseUrl = loginForm.baseUrl.trim();
  const trimmedUsername = loginForm.username.trim();
  const isFormReady =
    isValidSynologyUrl(trimmedBaseUrl) && trimmedUsername.length > 0 && loginForm.password.length > 0;
  const isLoginDisabled = isLoggingIn || !isFormReady;

  useEffect(() => {
    if (loginCountdown === null) {
      return;
    }

    if (loginCountdown <= 0) {
      setLoginCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoginCountdown((prev) => (prev != null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [loginCountdown]);

  // Check if API is ready
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    
    const checkApi = () => {
      console.log(`Checking for window.audioStation (attempt ${retryCount + 1}):`, !!window.audioStation);
      
      if (window.audioStation) {
        console.log('API is ready');
        setIsApiReady(true);
        return;
      }
      
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`API not ready, retrying in 500ms... (${retryCount}/${maxRetries})`);
        setTimeout(checkApi, 500);
      } else {
        console.error('API still not ready after maximum retries');
        // Set a fallback state to show an error message
        setIsApiReady(true); // Set to true to show error UI
      }
    };
    
    checkApi();
  }, []);

  useEffect(() => {
    const className = 'login-background';
    if (!sessionReady) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
    return () => {
      document.body.classList.remove(className);
    };
  }, [sessionReady]);

  useEffect(() => {
    if (!window.audioStation?.updateLayoutHeader) {
      return;
    }

    const target = headerRef.current;
    if (!target) {
      // when header not rendered (e.g., logged out) reset to default
      window.audioStation.updateLayoutHeader(0);
      return;
    }

    const report = () => {
      const height = Math.ceil(target.getBoundingClientRect().height);
      const adjusted = height + 2; // minimal buffer to prevent webview overlap
      console.log('[Renderer] reporting header height', height, 'adjusted', adjusted);
      window.audioStation?.updateLayoutHeader(adjusted);
    };

    report();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        report();
      });
      observer.observe(target);
      return () => {
        observer.disconnect();
      };
    }

    const onResize = () => report();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [sessionReady, isApiReady]);

  useEffect(() => {
    const handler = (_event: IpcRendererEvent, nextSettings: unknown) => {
      if (nextSettings && typeof nextSettings === 'object') {
        setSettings(nextSettings as Settings);
      }
    };

    window.electronAPI?.on?.('settings-updated', handler);

    const sessionClearedHandler = (_event: IpcRendererEvent, payload: unknown) => {
      const language =
        payload && typeof payload === 'object' && 'language' in payload
          ? (payload as { language?: Settings['language'] }).language
          : undefined;
      setSettings((prev) => {
        if (!prev && !language) {
          return prev;
        }
        const base: Settings = {
          baseUrl: '',
          username: '',
          ignoreCertificateErrors: false,
          notifications: true,
          mediaKeys: true,
          theme: 'system',
          language: language ?? 'en',
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
        return {
          ...base,
          ...(prev ?? {})
        };
      });
    };

    window.electronAPI?.on?.('session-cleared', sessionClearedHandler);

    return () => {
      window.electronAPI?.removeListener?.('settings-updated', handler);
      window.electronAPI?.removeListener?.('session-cleared', sessionClearedHandler);
    };
  }, []);

  // Listen for menu events
  useEffect(() => {
    const handleOpenSettings = () => {
      setShowSettings(true);
    };

    const handleLogoutEvent = () => {
      void handleLogout();
    };

    const handleSessionExpired = (_event: unknown, ...args: unknown[]) => {
      const reason = args[0] as string | undefined;
      console.log('Session expired event received:', reason);
      setSessionReady(false);
      setShowSettings(false);
      if (reason === 'timeout') {
        setLoginError(t.login.sessionExpiredMessage);
      }
    };

  const handleSessionCleared = (_event: unknown, ...args: unknown[]) => {
    const payload = (args[0] as { language?: Settings['language'] } | undefined) ?? undefined;
    const resolvedLanguage = payload?.language ?? 'en';
    setSessionReady(false);
    setShowSettings(false);
    setSettings((prev) =>
      prev
        ? { ...prev, language: resolvedLanguage }
        : {
            baseUrl: '',
            username: '',
            ignoreCertificateErrors: false,
            notifications: true,
            mediaKeys: true,
            theme: 'system',
            language: resolvedLanguage,
            autoLogoutMinutes: 0,
            showInTray: true,
            keepRunningInBackground: true,
            startMinimized: false,
            globalShortcuts: {
              playPause: 'Cmd+Option+P',
              nextTrack: 'Cmd+Option+Right',
              previousTrack: 'Cmd+Option+Left'
            }
          }
    );
    setPlayerState(DEFAULT_PLAYER_STATE);
    setLoginForm((prev) => ({
      ...prev,
      password: '',
      otpCode: ''
    }));
    setNetworkError('');
    setLoginCountdown(null);
  };

    const handleSessionResetForm = (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as { baseUrl?: string; username?: string } | undefined;
      setSessionReady(false);
      setShowSettings(false);
      setLoginError(null);
      setLoginForm((prev) => ({
        ...prev,
        baseUrl: payload?.baseUrl ?? prev.baseUrl,
        username: payload?.username ?? prev.username,
        password: '',
        otpCode: ''
      }));
    };

    if (window.electronAPI) {
      window.electronAPI.on('open-settings', handleOpenSettings);
      window.electronAPI.on('logout', handleLogoutEvent);
      window.electronAPI.on('session-expired', handleSessionExpired);
      window.electronAPI.on('session-cleared', handleSessionCleared);
      window.electronAPI.on('session-reset-form', handleSessionResetForm);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('open-settings', handleOpenSettings);
        window.electronAPI.removeListener('logout', handleLogoutEvent);
        window.electronAPI.removeListener('session-expired', handleSessionExpired);
        window.electronAPI.removeListener('session-cleared', handleSessionCleared);
        window.electronAPI.removeListener('session-reset-form', handleSessionResetForm);
      }
    };
  }, []);

  useEffect(() => {
    if (!isApiReady || !window.audioStation) {
      return;
    }

    const audioStation = window.audioStation as AudioStationApi;

    async function bootstrap() {
      try {
        const currentSettings = await audioStation.getSettings();
        setSettings(currentSettings);
        setLoginForm((prev) => ({
          ...prev,
          baseUrl: currentSettings.baseUrl || prev.baseUrl,
          username: currentSettings.username || prev.username,
          ignoreCertificateErrors: currentSettings.ignoreCertificateErrors
        }));

        const session = await audioStation.getSession();
        if (session) {
          setSessionReady(true);
          setLoginError(null);
        }
      } catch (error) {
        console.error('Failed to bootstrap app:', error);
      }
    }

    bootstrap();
  }, [isApiReady]);

  useEffect(() => {
    if (!sessionReady || !isApiReady || !window.audioStation) {
      return;
    }

    const audioStation = window.audioStation as AudioStationApi;

    const dispose = audioStation.onPlayerState((next: PlayerState) => {
      setPlayerState(next);
    });

    return () => {
      dispose?.();
    };
  }, [sessionReady, isApiReady]);

  useEffect(() => {
    if (sessionReady) {
      return;
    }

    setSettings(null);
    setPlayerState(DEFAULT_PLAYER_STATE);
    setLoginForm((prev) => ({
      ...prev,
      password: '',
      otpCode: ''
    }));
  }, [sessionReady]);


  const handleLogin = async () => {
    const audioStation = window.audioStation;
    if (!audioStation) {
      setLoginError(t.app.applicationErrorDescription);
      return;
    }

    if (!trimmedBaseUrl || !isValidSynologyUrl(trimmedBaseUrl)) {
      setLoginError(t.login.errors.invalidUrl);
      return;
    }

    if (!trimmedUsername) {
      setLoginError(t.login.errors.missingUsername);
      return;
    }

    if (!loginForm.password) {
      setLoginError(t.login.errors.missingPassword);
      return;
    }

    setIsLoggingIn(true);
    setLoginCountdown(10);
    setLoginError(null);
    setNetworkError('');
    try {
      const payload: LoginPayload = {
        baseUrl: trimmedBaseUrl,
        username: trimmedUsername,
        password: loginForm.password,
        ignoreCertificateErrors: loginForm.ignoreCertificateErrors
      };

      if (loginForm.otpCode) {
        payload.otpCode = loginForm.otpCode.trim();
      }

      await audioStation.login(payload);
      setSessionReady(true);
      setLoginForm((prev) => ({
        ...prev,
        password: '',
        otpCode: ''
      }));
    } catch (error) {
      console.error(error);
      const rawMessage = error instanceof Error ? error.message ?? '' : '';
      const loginErrorPrefix = "Error invoking remote method 'auth/login': Error: ";
      const sanitizedRaw = rawMessage.startsWith(loginErrorPrefix)
        ? rawMessage.slice(loginErrorPrefix.length)
        : rawMessage;
      const sanitized = sanitizedRaw.trim();
      const lowerCaseMessage = sanitized.toLowerCase();

      const networkIndicators = [
        'ehostunreach',
        'econnrefused',
        'enotfound',
        'etimedout',
        'econnreset',
        'network error',
        'network connection',
        'socket hang up',
        'failed to fetch',
        'dnslookup',
        'net::'
      ];
      const isNetworkIssue =
        networkIndicators.some((indicator) => lowerCaseMessage.includes(indicator)) ||
        lowerCaseMessage.startsWith('connect ') ||
        lowerCaseMessage.includes(' connect to ') ||
        lowerCaseMessage.includes(' connect ');

      if (isNetworkIssue) {
        const friendlyNetworkMessage = t.networkError.connectionFailedMessage;
        setLoginError(friendlyNetworkMessage);
        setNetworkError(sanitized || rawMessage || t.login.errors.invalidRequest);
      } else {
        setNetworkError('');
        const friendlyMessage = (() => {
          switch (sanitized) {
            case 'Invalid request to Synology API':
              return t.login.errors.invalidRequest;
            case 'Authentication failed: incorrect credentials or OTP required':
              return t.login.errors.authFailed;
            case 'Account disabled':
              return t.login.errors.accountDisabled;
            case 'Permission denied':
              return t.login.errors.permissionDenied;
            case 'Insufficient privileges':
              return t.login.errors.insufficientPrivileges;
            case 'OTP code required':
              return t.login.errors.otpRequired;
            case 'Invalid response from Synology API':
              return t.login.errors.invalidResponse;
            case 'Unable to login – please verify NAS address and credentials':
              return t.login.errors.generic;
            case 'Request timed out':
              return t.login.errors.timeout;
            default:
              return sanitized || rawMessage || t.login.errors.generic;
          }
        })();
        setLoginError(friendlyMessage);
      }
    } finally {
      setIsLoggingIn(false);
      setLoginCountdown(null);
    }
  };

  type ControlAction = Parameters<AudioStationApi['control']>[0];

  const handleControl = (action: ControlAction) => {
    const audioStation = window.audioStation;
    if (audioStation) {
      audioStation.control(action);
    }
  };

  const handlePlayToggle = () => {
    if (playerState.status === 'playing') {
      handleControl({ type: 'pause' });
    } else {
      handleControl({ type: 'play' });
    }
  };

  const handleSettingsUpdate = async (update: SettingsUpdate) => {
    const audioStation = window.audioStation;
    if (!audioStation) {
      return;
    }
    const next = await audioStation.updateSettings(update);
    setSettings(next);
  };

  const handleLogout = async () => {
    const audioStation = window.audioStation;
    if (!audioStation) {
      return;
    }
    try {
      await audioStation.logout();
      setSessionReady(false);
      setShowSettings(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleSettings = () => {
    console.log('Toggle settings clicked, current state:', showSettings);
    setShowSettings((prev) => {
      console.log('Settings state changing from', prev, 'to', !prev);
      return !prev;
    });
  };

  const sessionState = useMemo(() => {
    return sessionReady ? 'connected' : 'logged-out';
  }, [sessionReady]);

  const renderLogin = () => (
    <div className="settings-panel" style={{ maxWidth: 420 }}>
      <h2>{t.login.title}</h2>
      <div className="settings-item">
        <label>{t.login.nasAddress}</label>
        <input
          type="text"
          value={loginForm.baseUrl}
          placeholder={t.login.nasAddressPlaceholder}
          onChange={(event) => setLoginForm({ ...loginForm, baseUrl: event.target.value })}
          onPaste={(e) => {
            console.log('Paste event on baseUrl input');
          }}
          autoComplete="off"
        />
      </div>
      <div className="settings-item">
        <label>{t.login.account}</label>
        <input
          type="text"
          value={loginForm.username}
          onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
          onPaste={(e) => {
            console.log('Paste event on username input');
          }}
        />
      </div>
      <div className="settings-item">
        <label>{t.login.password}</label>
        <input
          type="password"
          value={loginForm.password}
          onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
          onPaste={(e) => {
            console.log('Paste event on password input');
          }}
        />
      </div>
      <div className="settings-item">
        <label>{t.login.otp} {t.login.otpOptional}</label>
        <input
          type="text"
          value={loginForm.otpCode}
          onChange={(event) => setLoginForm({ ...loginForm, otpCode: event.target.value })}
          onPaste={(e) => {
            console.log('Paste event on otpCode input');
          }}
        />
      </div>
      {/* Auto-detected for local/private IPs - no need to show checkbox */}
      {loginError ? <span className="helper-text" style={{ color: '#ff8787' }}>{loginError}</span> : null}
      {isLoggingIn && loginCountdown !== null ? (
        <span className="helper-text" style={{ color: '#64748b' }}>
          {t.login.timeoutHint.replace('{seconds}', String(loginCountdown))}
        </span>
      ) : null}
      {networkError ? (
        <details className="helper-text" style={{ color: '#64748b', marginTop: '4px' }}>
          <summary style={{ cursor: 'pointer' }}>{t.networkError.detailSummary}</summary>
          <pre
            style={{
              marginTop: '4px',
              padding: '8px',
              background: '#f1f5f9',
              borderRadius: '8px',
              color: '#13263C',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {networkError}
          </pre>
        </details>
      ) : null}
      <div className="inline-group" style={{ justifyContent: 'flex-end' }}>
        <button className="primary" onClick={handleLogin} disabled={isLoginDisabled}>
          {isLoggingIn ? t.common.connecting : t.common.signIn}
        </button>
      </div>
    </div>
  );

  const renderSettingsPanel = () => (
    <div className="settings-panel" style={{ maxWidth: 600 }}>
      <h2>{t.settings.title}</h2>

      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '12px' }}>{t.settings.startupBackground}</h3>
        <div className="settings-item">
          <label>{t.settings.launchAtLogin}</label>
          <input
            type="checkbox"
            checked={settings?.autoLaunch ?? false}
            onChange={(event) => handleSettingsUpdate({ autoLaunch: event.target.checked })}
          />
        </div>
        <div className="settings-item">
          <label>{t.settings.showTrayIcon}</label>
          <input
            type="checkbox"
            checked={settings?.showInTray ?? false}
            onChange={(event) => handleSettingsUpdate({ showInTray: event.target.checked })}
          />
        </div>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '12px' }}>{t.settings.appearanceLanguage}</h3>
        <div className="settings-item">
          <label>{t.common.language}</label>
          <select
            value={settings?.language ?? 'system'}
            onChange={(event) => handleSettingsUpdate({ language: event.target.value as Settings['language'] })}
          >
            <option value="system">{t.settings.followSystem}</option>
            <option value="en">{t.settings.english}</option>
            <option value="zh">{t.settings.chinese}</option>
          </select>
        </div>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '12px' }}>{t.settings.accountSecurity}</h3>
        <div className="settings-item">
          <label>{t.settings.ignoreCertificateErrors}</label>
          <input
            type="checkbox"
            checked={settings?.ignoreCertificateErrors ?? false}
            onChange={(event) => handleSettingsUpdate({ ignoreCertificateErrors: event.target.checked })}
          />
        </div>
        <div className="settings-item">
          <label>{t.settings.autoSignOutMinutes}</label>
          <input
            type="number"
            min={0}
            value={settings?.autoLogoutMinutes ?? 0}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              handleSettingsUpdate({ autoLogoutMinutes: Number.isNaN(value) ? 0 : Math.max(0, value) });
            }}
            style={{ width: '120px' }}
          />
        </div>
        <div className="settings-item">
          <button
            className="secondary"
            onClick={async () => {
              try {
                await window.audioStation?.clearCredentials?.();
                setSessionReady(false);
                setShowSettings(false);
                setLoginForm((prev) => ({ ...prev, password: '', otpCode: '' }));
              } catch (error) {
                console.error('Failed to clear stored credentials from quick settings:', error);
              }
            }}
          >
            {t.settings.clearCredentials}
          </button>
        </div>
      </section>

    </div>
  );

  if (!isApiReady) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>{t.app.title}</h1>
        </header>
        <main className="app-content">
          <div className="empty-state">
            <div className="settings-panel" style={{ maxWidth: 520 }}>
              <h2>{t.app.loading}</h2>
              <p>{t.app.initializing}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Check if API is actually available
  if (isApiReady && !window.audioStation) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>{t.app.title}</h1>
        </header>
        <main className="app-content">
          <div className="empty-state">
            <div className="settings-panel" style={{ maxWidth: 520 }}>
              <h2>{t.app.applicationError}</h2>
              <p>{t.app.applicationErrorDescription}</p>
              <p>{t.app.applicationErrorSuggestion}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {sessionState === 'connected' ? (
        <header className="app-header" ref={headerRef}>
          <h1>{t.app.title}</h1>
          <div className="inline-group">
            <button className="secondary" onClick={handleLogout}>
              {t.common.signOut}
            </button>
          </div>
        </header>
      ) : null}
      <main className="app-content">
        {sessionState === 'connected' ? null : (
          <div className="empty-state">{renderLogin()}</div>
        )}
      </main>
      {showSettings && sessionState === 'connected' && (
        <div className="settings-overlay" onClick={toggleSettings}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            {renderSettingsPanel()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

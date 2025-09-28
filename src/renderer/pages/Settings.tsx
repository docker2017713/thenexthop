import { useEffect, useState } from 'react';
import type { LanguagePreference, Settings, SettingsUpdate } from '../../shared/types';
import { useI18n } from '../hooks/useI18n';

const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  username: '',
  ignoreCertificateErrors: false,
  notifications: true,
  mediaKeys: true,
  theme: 'system',
  language: 'en',
  autoLogoutMinutes: 0,
  globalShortcuts: {
    playPause: 'Cmd+Option+P',
    nextTrack: 'Cmd+Option+Right',
    previousTrack: 'Cmd+Option+Left'
  }
};

type SettingsProps = {
  standalone?: boolean;
};

function Settings({ standalone = false }: SettingsProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useI18n(settings);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (window.audioStation) {
        const currentSettings = await window.audioStation.getSettings();
        setSettings(currentSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsUpdate = async (update: SettingsUpdate) => {
    try {
      if (window.audioStation) {
        const newSettings = await window.audioStation.updateSettings(update);
        setSettings(newSettings);
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#00B2A9',
        color: '#ffffff'
      }}>
        <div>{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div
      className="settings-page"
      style={{
        background: '#00B2A9',
        color: '#ffffff',
        minHeight: '100vh',
        maxHeight: '100vh',
        overflowY: 'auto',
        padding: '24px',
        paddingTop: 'calc(24px + env(safe-area-inset-top, 0px) + 28px)', // 为隐藏的标题栏留出空间
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1
          style={{ fontSize: '24px', fontWeight: '600', marginBottom: '32px', color: '#ffffff' }}
        >
          {t.settings.title}
        </h1>

        {/* Appearance & Language */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#ffffff' }}
          >
            {t.settings.appearanceLanguage}
          </h2>

          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#13263C' }}>
              <span>{t.common.language}</span>
              <select
                value={settings.language}
                onChange={(e) => handleSettingsUpdate({ language: e.target.value as LanguagePreference })}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#13263C'
                }}
              >
                <option value="system">{t.settings.followSystem}</option>
                <option value="en">{t.settings.english}</option>
                <option value="zh">{t.settings.chinese}</option>
              </select>
            </label>
          </div>
        </div>

        {/* Account & Security */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#ffffff' }}
          >
            {t.settings.accountSecurity}
          </h2>

          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: '#13263C' }}>
              <input
                type="checkbox"
                checked={settings.ignoreCertificateErrors}
                onChange={(e) => handleSettingsUpdate({ ignoreCertificateErrors: e.target.checked })}
                style={{ marginRight: '12px', transform: 'scale(1.2)' }}
              />
              {t.settings.ignoreCertificateErrors}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#13263C' }}>
              <span>{t.settings.autoSignOut}</span>
              <input
                type="number"
                min={0}
                value={settings.autoLogoutMinutes}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  handleSettingsUpdate({
                    autoLogoutMinutes: Number.isNaN(value) ? 0 : Math.max(0, value)
                  });
                }}
                style={{
                  width: '120px',
                  padding: '8px 12px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  color: '#13263C'
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {t.settings.autoSignOutDescription}
              </span>
            </label>

            <button
              onClick={async () => {
                try {
                  await window.audioStation?.clearCredentials?.();
                  await loadSettings();
                } catch (error) {
                  console.error('Failed to clear stored credentials:', error);
                }
              }}
              style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                color: '#13263C',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                alignSelf: 'flex-start'
              }}
            >
              {t.settings.clearCredentials}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;

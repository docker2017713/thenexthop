export type Language = 'en' | 'zh';

export interface Translations {
  // 通用
  common: {
    loading: string;
    error: string;
    close: string;
    save: string;
    cancel: string;
    confirm: string;
    settings: string;
    language: string;
    theme: string;
    signOut: string;
    signIn: string;
    connecting: string;
  };
  
  // 登录页面
  login: {
    title: string;
    nasAddress: string;
    nasAddressPlaceholder: string;
    account: string;
    password: string;
    otp: string;
    otpOptional: string;
    ignoreCertificateErrors: string;
    sessionExpired: string;
    sessionExpiredMessage: string;
    timeoutHint: string;
    errors: {
      invalidRequest: string;
      authFailed: string;
      accountDisabled: string;
      permissionDenied: string;
      insufficientPrivileges: string;
      otpRequired: string;
      invalidResponse: string;
      generic: string;
      invalidUrl: string;
      missingUsername: string;
      missingPassword: string;
      timeout: string;
    };
  };
  // 网络错误
  networkError: {
    title: string;
    connectionFailed: string;
    connectionFailedMessage: string;
    detailSummary: string;
    solutions: {
      title: string;
      checkNetwork: string;
      checkFirewall: string;
      checkPermissions: string;
      tryHttp: string;
      restartApp: string;
    };
      actions: {
        retry: string;
        openSettings: string;
        checkNetwork: string;
        copyError: string;
    };
  };

 // 设置页面
  settings: {
    title: string;
    appearanceLanguage: string;
    accountSecurity: string;
    startupBackground: string;
    launchAtLogin: string;
    showTrayIcon: string;
    keepRunningWhenClosed: string;
    followSystem: string;
    light: string;
    dark: string;
    english: string;
    chinese: string;
    ignoreCertificateErrors: string;
    autoSignOut: string;
    autoSignOutMinutes: string;
    autoSignOutDescription: string;
    clearSavedCredentials: string;
    clearCredentials: string;
  };
  
  // 应用状态
  app: {
    title: string;
    loading: string;
    initializing: string;
    applicationError: string;
    applicationErrorDescription: string;
    applicationErrorSuggestion: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    common: {
      loading: 'Loading...',
      error: 'Error',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      settings: 'Settings',
      language: 'Language',
      theme: 'Theme',
      signOut: 'Sign Out',
      signIn: 'Sign In',
      connecting: 'Connecting…'
    },
    login: {
      title: 'Connect to Audio Station',
      nasAddress: 'NAS Address',
      nasAddressPlaceholder: 'https://your-nas.local:5001',
      account: 'Account',
      password: 'Password',
    otp: 'OTP',
    otpOptional: '(optional)',
    ignoreCertificateErrors: 'Ignore certificate errors',
    sessionExpired: 'Session ended due to inactivity. Please sign in again.',
    sessionExpiredMessage: 'Session ended due to inactivity. Please sign in again.',
    timeoutHint: 'Attempting to connect… will cancel automatically after {seconds}s.',
    errors: {
      invalidRequest: 'Unable to reach your Synology NAS. Please confirm the URL is correct and the NAS is online.',
      authFailed: 'Authentication failed. Please check your username, password, or OTP code.',
      accountDisabled: 'This account is disabled on the NAS. Contact your administrator.',
      permissionDenied: 'Permission denied. Verify this account has rights to use Audio Station.',
      insufficientPrivileges: 'Insufficient privileges for this action. Check NAS permissions.',
      otpRequired: 'An OTP code is required. Please enter the verification code and try again.',
      invalidResponse: 'Received an unexpected response from the NAS. Please try again later or contact support.',
      generic: 'Unable to sign in. Please verify the NAS address and your credentials.',
      invalidUrl: 'Please enter a valid URL starting with http:// or https://.',
      missingUsername: 'Username is required.',
      missingPassword: 'Password is required.',
      timeout: 'Connection timed out. Please check the network or try again later.'
    }
  },
    networkError: {
      title: 'Connection Error',
      connectionFailed: 'Failed to connect to NAS',
      connectionFailedMessage: 'Unable to establish connection to your Synology NAS. This may be caused by network issues, firewall settings, or application permissions.',
      detailSummary: 'View detailed error information',
      solutions: {
        title: 'Troubleshooting:',
        checkNetwork: '1. Ensure this computer can reach your NAS',
        checkFirewall: '2. Allow the app through the firewall',
        checkPermissions: '3. Grant network permissions in System Preferences > Security & Privacy',
        tryHttp: '4. Try using HTTP instead of HTTPS on local networks',
        restartApp: '5. Restart the application and try again'
      },
      actions: {
        retry: 'Retry',
        openSettings: 'Open Settings',
        checkNetwork: 'Test Connection',
        copyError: 'Copy Error Details'
      }
    },
    settings: {
      title: 'Settings',
      appearanceLanguage: 'Appearance & Language',
      accountSecurity: 'Account & Security',
      startupBackground: 'Startup & Background',
      launchAtLogin: 'Launch at login',
      showTrayIcon: 'Show tray icon',
      keepRunningWhenClosed: 'Keep running when closed',
      followSystem: 'Follow system',
      light: 'Light',
      dark: 'Dark',
      english: 'English',
      chinese: '中文',
      ignoreCertificateErrors: 'Ignore self-signed certificate errors',
      autoSignOut: 'Auto sign-out after inactivity (minutes)',
      autoSignOutMinutes: 'Auto sign-out (minutes)',
      autoSignOutDescription: 'Set to 0 to disable automatic sign-out.',
      clearSavedCredentials: 'Clear saved credentials',
      clearCredentials: 'Clear saved credentials'
    },
    app: {
      title: 'Synology Music Player',
      loading: 'Loading...',
      initializing: 'Initializing application...',
      applicationError: 'Application Error',
      applicationErrorDescription: 'Failed to initialize application. Please check the console for details.',
      applicationErrorSuggestion: 'Try refreshing the application or restarting it.'
    }
  },
  zh: {
    common: {
      loading: '加载中...',
      error: '错误',
      close: '关闭',
      save: '保存',
      cancel: '取消',
      confirm: '确认',
      settings: '设置',
      language: '语言',
      theme: '主题',
      signOut: '退出登录',
      signIn: '登录',
      connecting: '连接中...'
    },
    login: {
      title: '连接到 Synology Music Player',
      nasAddress: 'NAS 地址',
      nasAddressPlaceholder: 'https://your-nas.local:5001',
      account: '账户',
      password: '密码',
    otp: 'OTP',
    otpOptional: '(可选)',
    ignoreCertificateErrors: '忽略证书错误',
    sessionExpired: '由于不活动，会话已结束。请重新登录。',
    sessionExpiredMessage: '由于不活动，会话已结束。请重新登录。',
    timeoutHint: '正在尝试连接…超过 {seconds} 秒将自动取消。',
    errors: {
      invalidRequest: '无法连接到您的 Synology NAS，请确认地址填写正确并保证 NAS 在线。',
      authFailed: '认证失败，请检查用户名、密码或一次性验证码。',
      accountDisabled: '该账号已在 NAS 上被禁用，请联系管理员。',
      permissionDenied: '权限不足，请确认该账号有使用 Audio Station 的权限。',
      insufficientPrivileges: '账号权限不足，请在 NAS 中检查相关设置。',
      otpRequired: '需要一次性验证码，请输入验证码后重试。',
      invalidResponse: 'NAS 返回了异常响应，请稍后重试或联系管理员。',
      generic: '登录失败，请再次确认 NAS 地址和账号信息。',
      invalidUrl: '请输入以 http:// 或 https:// 开头的有效地址。',
      missingUsername: '请输入账号。',
      missingPassword: '请输入密码。',
      timeout: '连接超时，请检查网络后重试。'
    }
  },
    networkError: {
      title: '连接错误',
      connectionFailed: '无法连接到 NAS',
      connectionFailedMessage: '可能是网络、防火墙或应用权限导致无法连接到您的 Synology NAS。',
      detailSummary: '查看详细错误信息',
      solutions: {
        title: '排查步骤：',
        checkNetwork: '1. 检查当前电脑是否能访问 NAS',
        checkFirewall: '2. 确保防火墙允许本应用访问网络',
        checkPermissions: '3. 在“系统偏好设置 → 安全性与隐私”授予网络权限',
        tryHttp: '4. 局域网环境可尝试改用 HTTP',
        restartApp: '5. 重启应用后重试'
      },
      actions: {
        retry: '重试',
        openSettings: '打开设置',
        checkNetwork: '测试连接',
        copyError: '复制错误详情'
      }
    },
    settings: {
      title: '设置',
      appearanceLanguage: '外观与语言',
      accountSecurity: '账户与安全',
      startupBackground: '启动与后台',
      launchAtLogin: '开机自启动',
      showTrayIcon: '显示托盘图标',
      keepRunningWhenClosed: '关闭时保持运行',
      followSystem: '跟随系统',
      light: '浅色',
      dark: '深色',
      english: 'English',
      chinese: '中文',
      ignoreCertificateErrors: '忽略自签名证书错误',
      autoSignOut: '不活动后自动退出 (分钟)',
      autoSignOutMinutes: '自动退出 (分钟)',
      autoSignOutDescription: '设置为 0 以禁用自动退出。',
      clearSavedCredentials: '清除保存的凭据',
      clearCredentials: '清除保存的凭据'
    },
    app: {
      title: 'Synology Music Player',
      loading: '加载中...',
      initializing: '正在初始化应用程序...',
      applicationError: '应用程序错误',
      applicationErrorDescription: '初始化应用程序失败。请检查控制台了解详情。',
      applicationErrorSuggestion: '尝试刷新应用程序或重新启动它。'
    }
  }
};

export function getTranslations(language: Language): Translations {
  return translations[language] || translations.en;
}

export function detectSystemLanguage(): Language {
  // 检测系统语言
  const systemLang = navigator.language || (navigator as any).userLanguage;
  
  // 检查主要语言
  if (systemLang.startsWith('zh')) {
    return 'zh';
  }
  
  // 检查语言列表
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      if (lang.startsWith('zh')) {
        return 'zh';
      }
    }
  }
  
  return 'en';
}

export function getCurrentLanguage(settingsLanguage: string | undefined): Language {
  if (settingsLanguage === 'zh') {
    return 'zh';
  }
  if (settingsLanguage === 'en') {
    return 'en';
  }
  
  // 如果设置为 'system' 或未设置，使用系统语言
  return detectSystemLanguage();
}

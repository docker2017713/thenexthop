import { app } from 'electron';

export type Language = 'en' | 'zh';

export interface TrayTranslations {
  showWindow: string;
  play: string;
  pause: string;
  nextTrack: string;
  previousTrack: string;
  signInToEnableControls: string;
  quit: string;
  tooltip: string;
}

export interface MenuTranslations {
  appName: string;
  about: string;
  showWindow: string;
  settings: string;
  signOut: string;
  quit: string;
  edit: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  view: string;
  reload: string;
  toggleDeveloperTools: string;
}

const trayTranslations: Record<Language, TrayTranslations> = {
  en: {
    showWindow: 'Show Window',
    play: 'Play',
    pause: 'Pause',
    nextTrack: 'Next Track',
    previousTrack: 'Previous Track',
    signInToEnableControls: 'Sign in to enable controls',
    quit: 'Quit',
    tooltip: 'Synology Music Player'
  },
  zh: {
    showWindow: '显示窗口',
    play: '播放',
    pause: '暂停',
    nextTrack: '下一首',
    previousTrack: '上一首',
    signInToEnableControls: '请登录以启用控制',
    quit: '退出',
    tooltip: 'Synology Music Player'
  }
};

const menuTranslations: Record<Language, MenuTranslations> = {
  en: {
    appName: 'Synology Music Player',
    about: 'About Synology Music Player',
    showWindow: 'Show Window',
    settings: 'Settings',
    signOut: 'Sign Out',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    toggleDeveloperTools: 'Toggle Developer Tools'
  },
  zh: {
    appName: 'Synology 音乐播放器',
    about: '关于 Synology 音乐播放器',
    showWindow: '显示窗口',
    settings: '设置',
    signOut: '退出登录',
    quit: '退出',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '查看',
    reload: '重新加载',
    toggleDeveloperTools: '切换开发者工具'
  }
};

export function detectSystemLanguage(): Language {
  // 检测系统语言
  const systemLang = app.getLocale();
  
  if (systemLang.startsWith('zh')) {
    return 'zh';
  }
  
  return 'en';
}

export function getTrayTranslations(language: string | undefined): TrayTranslations {
  if (language === 'zh') {
    return trayTranslations.zh;
  }
  if (language === 'en') {
    return trayTranslations.en;
  }
  
  // 如果设置为 'system' 或未设置，使用系统语言
  return trayTranslations[detectSystemLanguage()];
}

export function getMenuTranslations(language: string | undefined): MenuTranslations {
  if (language === 'zh') {
    return menuTranslations.zh;
  }
  if (language === 'en') {
    return menuTranslations.en;
  }
  
  // 如果设置为 'system' 或未设置，使用系统语言
  return menuTranslations[detectSystemLanguage()];
}

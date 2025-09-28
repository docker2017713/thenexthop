import { useEffect, useState } from 'react';
import { getCurrentLanguage, getTranslations, type Language, type Translations } from '../../shared/i18n';
import type { Settings } from '../../shared/types';

const DEFAULT_LANGUAGE: Language = 'en';

export function useI18n(settings: Settings | null): { t: Translations; language: Language } {
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [translations, setTranslations] = useState<Translations>(getTranslations(DEFAULT_LANGUAGE));

  useEffect(() => {
    if (settings) {
      const currentLanguage =
        settings.language === 'system'
          ? getCurrentLanguage('system')
          : getCurrentLanguage(settings.language);
      setLanguage(currentLanguage);
      setTranslations(getTranslations(currentLanguage));
    } else {
      setLanguage(DEFAULT_LANGUAGE);
      setTranslations(getTranslations(DEFAULT_LANGUAGE));
    }
  }, [settings]);

  return { t: translations, language };
}

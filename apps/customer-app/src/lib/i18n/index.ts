import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;

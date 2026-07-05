import type { Language } from './common';

export interface LanguageMap<Value> {
  readonly en: Value;
  readonly ja: Value;
}

export const languageOptions: readonly Language[] = ['en', 'ja'];

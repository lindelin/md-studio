import {
    DEFAULT_UI_LANGUAGE_PREFERENCE,
    resolveUiLanguage,
    translate,
    type ResolvedUiLanguage,
    type UiLanguagePreference,
} from './i18n';
import { loadPreference } from './preferences';

const isUiLanguagePreference = (value: unknown): value is UiLanguagePreference =>
    value === 'system' || value === 'en' || value === 'zh-CN' || value === 'ja';

export function getCurrentUiLanguage(browserLanguage = typeof navigator === 'undefined' ? 'en' : navigator.language): ResolvedUiLanguage {
    const preference = loadPreference<UiLanguagePreference>('uiLanguage', DEFAULT_UI_LANGUAGE_PREFERENCE, isUiLanguagePreference);
    return resolveUiLanguage(preference, browserLanguage);
}

export function runtimeTranslate(message: string, browserLanguage?: string) {
    return translate(getCurrentUiLanguage(browserLanguage), message);
}

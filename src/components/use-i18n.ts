import { useCallback } from 'react';
import { resolveUiLanguage, translate } from '../i18n';
import { useApplicationSettings } from './use-application-client';

export function useI18n() {
    const preference = useApplicationSettings().uiLanguage;
    const language = resolveUiLanguage(preference);
    const t = useCallback((message: string) => translate(language, message), [language]);
    return { language, preference, t };
}

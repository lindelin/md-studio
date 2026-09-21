import { useCallback, useEffect } from 'react';
import { resolveUiLanguage, translate } from '../i18n';
import { useApplicationSettings } from './use-application-client';

export function useI18n() {
    const preference = useApplicationSettings().uiLanguage;
    const language = resolveUiLanguage(preference);
    useEffect(() => { document.documentElement.lang = language; }, [language]);
    const t = useCallback((message: string) => translate(language, message), [language]);
    return { language, preference, t };
}

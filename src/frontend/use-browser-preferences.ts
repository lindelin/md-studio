import { useSyncExternalStore } from 'react';
import { browserPreferences } from './browser-preferences-store';

export function useBrowserPreferences() {
    return useSyncExternalStore(
        browserPreferences.subscribe,
        browserPreferences.getSnapshot,
        browserPreferences.getSnapshot
    );
}

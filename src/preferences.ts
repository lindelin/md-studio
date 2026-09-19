export type PreferenceValidator<T> = (value: unknown) => value is T;

export const APP_PREFERENCE_KEYS = [
    'version',
    'colorTheme',
    'vintageMode',
    'discProtectedDialogDisabled',
    'notifyWhenFinished',
    'fullWidthSupport',
    'customServices',
    'lastSelectedService',
    'audioExportService',
    'audioExportServiceConfig',
    'libraryService',
    'libraryServiceConfig',
    'pageFullHeight',
    'pageFullWidth',
    'archiveDiscCreateZip',
    'factoryModeUseSlowerExploit',
    'factoryModeShortcuts',
    'factoryModeNERAWDownload',
    'factoryBadSectorRememberChoice',
    'uploadFormat',
    'trackTitleFormat',
    'recognitionTrackTitleFormat',
    'recognitionImportMethod',
    'minidiscLocalBridgeEnabled',
    'minidiscLocalBridgeUrl',
    'minidiscLocalBridgeToken',
] as const;

function defaultStorage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function removeInvalidPreference(storage: Storage, key: string): void {
    try {
        storage.removeItem(key);
    } catch (error) {
        console.warn(`Could not remove invalid preference "${key}"`, error);
    }
}

export function savePreference(key: string, value: unknown, storage: Storage | null = defaultStorage()): boolean {
    if (!storage) return false;
    try {
        storage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.warn(`Could not save preference "${key}"`, error);
        return false;
    }
}

export function readRawPreference(key: string, storage: Storage | null = defaultStorage()): string | null {
    if (!storage) return null;
    try {
        return storage.getItem(key);
    } catch (error) {
        console.warn(`Could not read preference "${key}"`, error);
        return null;
    }
}

export function saveRawPreference(key: string, value: string, storage: Storage | null = defaultStorage()): boolean {
    if (!storage) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`Could not save preference "${key}"`, error);
        return false;
    }
}

export function loadPreference<T>(
    key: string,
    defaultValue: T,
    validator?: PreferenceValidator<T>,
    storage: Storage | null = defaultStorage()
): T {
    if (!storage) return defaultValue;

    let serialized: string | null;
    try {
        serialized = storage.getItem(key);
    } catch (error) {
        console.warn(`Could not read preference "${key}"`, error);
        return defaultValue;
    }

    if (serialized === null) return defaultValue;

    try {
        const value: unknown = JSON.parse(serialized);
        if (validator && !validator(value)) {
            removeInvalidPreference(storage, key);
            return defaultValue;
        }
        return value as T;
    } catch {
        removeInvalidPreference(storage, key);
        return defaultValue;
    }
}

export function clearAppPreferences(storage: Storage | null = defaultStorage()): void {
    if (!storage) return;
    for (const key of APP_PREFERENCE_KEYS) {
        try {
            storage.removeItem(key);
        } catch (error) {
            console.warn(`Could not remove preference "${key}"`, error);
        }
    }
}

export const isBoolean: PreferenceValidator<boolean> = (value): value is boolean => typeof value === 'boolean';

export const isFiniteNumber: PreferenceValidator<number> = (value): value is number => typeof value === 'number' && Number.isFinite(value);

export function isOneOf<const T extends string>(values: readonly T[]): PreferenceValidator<T> {
    return (value): value is T => typeof value === 'string' && values.includes(value as T);
}

export function isPrimitiveRecord(value: unknown): value is Record<string, string | number | boolean> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'boolean' || isFiniteNumber(entry))
    );
}

export function isUploadFormat(value: unknown): value is Record<string, [number, number]> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every(
            (entry) =>
                Array.isArray(entry) &&
                entry.length === 2 &&
                entry.every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 0)
        )
    );
}

export function isServiceList(value: unknown): value is { name: string; parameters?: Record<string, string | number | boolean> }[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                typeof entry === 'object' &&
                entry !== null &&
                typeof (entry as { name?: unknown }).name === 'string' &&
                ((entry as { parameters?: unknown }).parameters === undefined ||
                    isPrimitiveRecord((entry as { parameters?: unknown }).parameters))
        )
    );
}

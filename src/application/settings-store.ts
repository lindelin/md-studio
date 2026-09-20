import { isBoolean, isOneOf, isPrimitiveRecord, isUploadFormat, loadPreference, savePreferencesAtomically } from '../preferences';
import { ApplicationError } from './contracts';
import type { CustomParameters } from '../custom-parameters';
import type { ImportTitleFormat } from './import-title';
import { DEFAULT_UI_LANGUAGE_PREFERENCE } from '../i18n';

export interface UserSettings {
    colorTheme: 'dark' | 'light' | 'system';
    uiLanguage: 'system' | 'en' | 'zh-CN';
    notifyWhenFinished: boolean;
    fullWidthSupport: boolean;
    factoryModeUseSlowerExploit: boolean;
    factoryModeNERAWDownload: boolean;
    audioEncoderId: string | null;
    audioExportService: number;
    audioExportServiceConfig: CustomParameters;
    libraryService: number;
    libraryServiceConfig: CustomParameters;
    uploadFormat: Record<string, [number, number]>;
    trackTitleFormat: ImportTitleFormat;
}

export interface SettingsSnapshot {
    revision: number;
    values: UserSettings;
}

export type UserSettingsUpdate = Partial<UserSettings>;

const defaults: UserSettings = {
    colorTheme: 'system',
    uiLanguage: DEFAULT_UI_LANGUAGE_PREFERENCE,
    notifyWhenFinished: false,
    fullWidthSupport: false,
    factoryModeUseSlowerExploit: false,
    factoryModeNERAWDownload: false,
    audioEncoderId: null,
    audioExportService: 1,
    audioExportServiceConfig: {},
    libraryService: -1,
    libraryServiceConfig: {},
    uploadFormat: {},
    trackTitleFormat: 'filename',
};

const booleanKeys = new Set<keyof UserSettings>(
    Object.keys(defaults).filter(
        (key) =>
            ![
                'colorTheme',
                'uiLanguage',
                'audioEncoderId',
                'audioExportService',
                'audioExportServiceConfig',
                'libraryService',
                'libraryServiceConfig',
                'uploadFormat',
                'trackTitleFormat',
            ].includes(key)
    ) as (keyof UserSettings)[]
);

const isAudioServiceIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isAudioEncoderId = (value: unknown): value is string | null =>
    value === null ||
    (typeof value === 'string' && value !== 'remote-atrac' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value));

const isLibraryServiceIndex = (value: unknown): value is number =>
    value === -1 || value === 0;

function browserStorage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

export class SettingsStore {
    private snapshot: SettingsSnapshot;
    private readonly listeners = new Set<(snapshot: SettingsSnapshot) => void>();

    constructor(private readonly storage: Storage | null = browserStorage()) {
        this.snapshot = { revision: 0, values: this.load() };
    }

    getSnapshot() {
        return structuredClone(this.snapshot);
    }

    subscribe(listener: (snapshot: SettingsSnapshot) => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    update(changes: UserSettingsUpdate, expectedRevision?: number) {
        if (expectedRevision !== undefined && expectedRevision !== this.snapshot.revision) {
            throw new ApplicationError('STALE_REVISION', 'Settings changed after this update was prepared.', {
                expectedRevision,
                actualRevision: this.snapshot.revision,
            });
        }
        const entries = Object.entries(changes) as [keyof UserSettings, unknown][];
        if (entries.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one setting must be changed.');
        for (const [key, value] of entries) this.validate(key, value);

        const values = { ...this.snapshot.values, ...structuredClone(changes) };
        this.persist(entries, values);
        this.snapshot = { revision: this.snapshot.revision + 1, values };
        const next = this.getSnapshot();
        for (const listener of this.listeners) listener(next);
        return next;
    }

    private persist(entries: [keyof UserSettings, unknown][], values: UserSettings) {
        if (!this.storage) return;
        const result = savePreferencesAtomically(entries.map(([key]) => [key, values[key]] as const), this.storage);
        if (result && !result.ok) {
            throw new ApplicationError(
                'PERSISTENCE_FAILED',
                'Settings could not be saved in this browser. Free some storage or reset the application, then try again.',
                {
                    cause: result.cause,
                    rollbackFailed: result.rollbackFailed,
                }
            );
        }
    }

    private load(): UserSettings {
        return {
            colorTheme: loadPreference('colorTheme', defaults.colorTheme, isOneOf(['dark', 'light', 'system'] as const), this.storage),
            uiLanguage: loadPreference('uiLanguage', defaults.uiLanguage, isOneOf(['system', 'en', 'zh-CN'] as const), this.storage),
            notifyWhenFinished: loadPreference('notifyWhenFinished', defaults.notifyWhenFinished, isBoolean, this.storage),
            fullWidthSupport: loadPreference('fullWidthSupport', defaults.fullWidthSupport, isBoolean, this.storage),
            factoryModeUseSlowerExploit: loadPreference(
                'factoryModeUseSlowerExploit',
                defaults.factoryModeUseSlowerExploit,
                isBoolean,
                this.storage
            ),
            factoryModeNERAWDownload: loadPreference(
                'factoryModeNERAWDownload',
                defaults.factoryModeNERAWDownload,
                isBoolean,
                this.storage
            ),
            audioEncoderId: loadPreference(
                'audioEncoderId',
                defaults.audioEncoderId,
                isAudioEncoderId,
                this.storage
            ),
            audioExportService: loadPreference('audioExportService', defaults.audioExportService, isAudioServiceIndex, this.storage),
            audioExportServiceConfig: loadPreference(
                'audioExportServiceConfig',
                defaults.audioExportServiceConfig,
                isPrimitiveRecord,
                this.storage
            ),
            libraryService: loadPreference('libraryService', defaults.libraryService, isLibraryServiceIndex, this.storage),
            libraryServiceConfig: loadPreference(
                'libraryServiceConfig',
                defaults.libraryServiceConfig,
                isPrimitiveRecord,
                this.storage
            ),
            uploadFormat: loadPreference('uploadFormat', defaults.uploadFormat, isUploadFormat, this.storage),
            trackTitleFormat: loadPreference(
                'trackTitleFormat',
                defaults.trackTitleFormat,
                isOneOf(['filename', 'title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'] as const),
                this.storage
            ),
        };
    }

    private validate(key: keyof UserSettings, value: unknown) {
        if (!(key in defaults)) throw new ApplicationError('INVALID_INPUT', `Unknown setting: ${String(key)}.`);
        if (key === 'colorTheme') {
            if (value !== 'dark' && value !== 'light' && value !== 'system') {
                throw new ApplicationError('INVALID_INPUT', 'colorTheme must be dark, light, or system.');
            }
            return;
        }
        if (key === 'uiLanguage') {
            if (value !== 'system' && value !== 'en' && value !== 'zh-CN') {
                throw new ApplicationError('INVALID_INPUT', 'uiLanguage must be system, en, or zh-CN.');
            }
            return;
        }
        if (key === 'audioEncoderId') {
            if (!isAudioEncoderId(value)) {
                throw new ApplicationError('INVALID_INPUT', 'audioEncoderId must be a stable service id or null.');
            }
            return;
        }
        if (key === 'audioExportService' || key === 'libraryService') {
            const isValid = key === 'audioExportService' ? isAudioServiceIndex(value) : isLibraryServiceIndex(value);
            if (!isValid) {
                throw new ApplicationError('INVALID_INPUT', `${key} must be a valid service index.`);
            }
            return;
        }
        if (key === 'audioExportServiceConfig' || key === 'libraryServiceConfig') {
            if (!isPrimitiveRecord(value)) {
                throw new ApplicationError('INVALID_INPUT', `${key} must contain only string, number, or boolean values.`);
            }
            return;
        }
        if (key === 'uploadFormat') {
            if (!isUploadFormat(value)) {
                throw new ApplicationError('INVALID_INPUT', 'uploadFormat must map device names to codec and bitrate indexes.');
            }
            return;
        }
        if (key === 'trackTitleFormat') {
            if (!isOneOf(['filename', 'title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'] as const)(value)) {
                throw new ApplicationError('INVALID_INPUT', 'trackTitleFormat is invalid.');
            }
            return;
        }
        if (!booleanKeys.has(key) || typeof value !== 'boolean') {
            throw new ApplicationError('INVALID_INPUT', `${String(key)} must be a boolean.`);
        }
    }
}

export const applicationSettings = new SettingsStore();

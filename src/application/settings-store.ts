import { isBoolean, isOneOf, isPrimitiveRecord, isUploadFormat, loadPreference, savePreference } from '../preferences';
import { ApplicationError } from './contracts';
import type { CustomParameters } from '../custom-parameters';
import type { ImportTitleFormat } from './import-title';

export interface UserSettings {
    colorTheme: 'dark' | 'light' | 'system';
    vintageMode: boolean;
    discProtectedDialogDisabled: boolean;
    notifyWhenFinished: boolean;
    fullWidthSupport: boolean;
    pageFullHeight: boolean;
    pageFullWidth: boolean;
    archiveDiscCreateZip: boolean;
    factoryModeUseSlowerExploit: boolean;
    factoryModeShortcuts: boolean;
    factoryModeNERAWDownload: boolean;
    audioEncoderId: string | null;
    audioExportService: number;
    audioExportServiceConfig: CustomParameters;
    libraryService: number;
    libraryServiceConfig: CustomParameters;
    uploadFormat: Record<string, [number, number]>;
    trackTitleFormat: ImportTitleFormat;
    recognitionTrackTitleFormat: Exclude<ImportTitleFormat, 'filename'>;
    recognitionImportMethod: 'exploits' | 'line-in';
    factoryBadSectorRememberChoice: boolean;
}

export interface SettingsSnapshot {
    revision: number;
    values: UserSettings;
}

export type UserSettingsUpdate = Partial<UserSettings>;

const defaults: UserSettings = {
    colorTheme: 'system',
    vintageMode: false,
    discProtectedDialogDisabled: false,
    notifyWhenFinished: false,
    fullWidthSupport: false,
    pageFullHeight: false,
    pageFullWidth: false,
    archiveDiscCreateZip: false,
    factoryModeUseSlowerExploit: false,
    factoryModeShortcuts: false,
    factoryModeNERAWDownload: false,
    audioEncoderId: null,
    audioExportService: 1,
    audioExportServiceConfig: {},
    libraryService: -1,
    libraryServiceConfig: {},
    uploadFormat: {},
    trackTitleFormat: 'filename',
    recognitionTrackTitleFormat: 'title',
    recognitionImportMethod: 'line-in',
    factoryBadSectorRememberChoice: false,
};

const booleanKeys = new Set<keyof UserSettings>(
    Object.keys(defaults).filter(
        (key) =>
            ![
                'colorTheme',
                'audioEncoderId',
                'audioExportService',
                'audioExportServiceConfig',
                'libraryService',
                'libraryServiceConfig',
                'uploadFormat',
                'trackTitleFormat',
                'recognitionTrackTitleFormat',
                'recognitionImportMethod',
            ].includes(key)
    ) as (keyof UserSettings)[]
);

const isAudioServiceIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isLibraryServiceIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= -1;

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
        for (const [key] of entries) savePreference(key, values[key], this.storage);
        this.snapshot = { revision: this.snapshot.revision + 1, values };
        const next = this.getSnapshot();
        for (const listener of this.listeners) listener(next);
        return next;
    }

    private load(): UserSettings {
        return {
            colorTheme: loadPreference('colorTheme', defaults.colorTheme, isOneOf(['dark', 'light', 'system'] as const), this.storage),
            vintageMode: loadPreference('vintageMode', defaults.vintageMode, isBoolean, this.storage),
            discProtectedDialogDisabled: loadPreference(
                'discProtectedDialogDisabled',
                defaults.discProtectedDialogDisabled,
                isBoolean,
                this.storage
            ),
            notifyWhenFinished: loadPreference('notifyWhenFinished', defaults.notifyWhenFinished, isBoolean, this.storage),
            fullWidthSupport: loadPreference('fullWidthSupport', defaults.fullWidthSupport, isBoolean, this.storage),
            pageFullHeight: loadPreference('pageFullHeight', defaults.pageFullHeight, isBoolean, this.storage),
            pageFullWidth: loadPreference('pageFullWidth', defaults.pageFullWidth, isBoolean, this.storage),
            archiveDiscCreateZip: loadPreference('archiveDiscCreateZip', defaults.archiveDiscCreateZip, isBoolean, this.storage),
            factoryModeUseSlowerExploit: loadPreference(
                'factoryModeUseSlowerExploit',
                defaults.factoryModeUseSlowerExploit,
                isBoolean,
                this.storage
            ),
            factoryModeShortcuts: loadPreference('factoryModeShortcuts', defaults.factoryModeShortcuts, isBoolean, this.storage),
            factoryModeNERAWDownload: loadPreference(
                'factoryModeNERAWDownload',
                defaults.factoryModeNERAWDownload,
                isBoolean,
                this.storage
            ),
            audioEncoderId: loadPreference(
                'audioEncoderId',
                defaults.audioEncoderId,
                (value): value is string | null =>
                    value === null || (typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)),
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
            recognitionTrackTitleFormat: loadPreference(
                'recognitionTrackTitleFormat',
                defaults.recognitionTrackTitleFormat,
                isOneOf(['title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'] as const),
                this.storage
            ),
            recognitionImportMethod: loadPreference(
                'recognitionImportMethod',
                defaults.recognitionImportMethod,
                isOneOf(['exploits', 'line-in'] as const),
                this.storage
            ),
            factoryBadSectorRememberChoice: loadPreference(
                'factoryBadSectorRememberChoice',
                defaults.factoryBadSectorRememberChoice,
                isBoolean,
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
        if (key === 'audioEncoderId') {
            if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
                throw new ApplicationError('INVALID_INPUT', 'audioEncoderId must be a stable service id.');
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
        if (key === 'recognitionTrackTitleFormat') {
            if (!isOneOf(['title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'] as const)(value)) {
                throw new ApplicationError('INVALID_INPUT', 'recognitionTrackTitleFormat is invalid.');
            }
            return;
        }
        if (key === 'recognitionImportMethod') {
            if (!isOneOf(['exploits', 'line-in'] as const)(value)) {
                throw new ApplicationError('INVALID_INPUT', 'recognitionImportMethod must be exploits or line-in.');
            }
            return;
        }
        if (!booleanKeys.has(key) || typeof value !== 'boolean') {
            throw new ApplicationError('INVALID_INPUT', `${String(key)} must be a boolean.`);
        }
    }
}

export const applicationSettings = new SettingsStore();

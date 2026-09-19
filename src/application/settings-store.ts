import { isBoolean, isOneOf, loadPreference, savePreference } from '../preferences';
import { ApplicationError } from './contracts';

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
};

const booleanKeys = new Set<keyof UserSettings>(
    Object.keys(defaults).filter((key) => key !== 'colorTheme') as (keyof UserSettings)[]
);

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

        const values = { ...this.snapshot.values, ...changes };
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
        if (!booleanKeys.has(key) || typeof value !== 'boolean') {
            throw new ApplicationError('INVALID_INPUT', `${String(key)} must be a boolean.`);
        }
    }
}

export const applicationSettings = new SettingsStore();

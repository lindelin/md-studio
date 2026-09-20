import { ApplicationError } from './contracts';
import type { SettingsStore } from './settings-store';

export const ONLINE_SERVICE_DISABLED_MESSAGE =
    'Online services are disabled. Enable them in Settings before using a remote encoder, remote library, or song recognition.';

export type OnlineServiceGuard = () => void;

export function assertOnlineServicesEnabled(enabled: boolean): void {
    if (!enabled) throw new ApplicationError('ONLINE_SERVICE_DISABLED', ONLINE_SERVICE_DISABLED_MESSAGE);
}

export function createOnlineServiceGuard(settings: SettingsStore): OnlineServiceGuard {
    return () => assertOnlineServicesEnabled(settings.getSnapshot().values.onlineServicesEnabled);
}

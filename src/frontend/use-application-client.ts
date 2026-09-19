import { useCallback, useContext, useSyncExternalStore } from 'react';
import { ApplicationClientContext } from './application-client-context';
import type { UserSettingsUpdate } from '../application/settings-store';
import type { ApplicationClient } from '../application/application-client';

export function useApplicationClient() {
    const client = useContext(ApplicationClientContext);
    if (!client) throw new Error('ApplicationClientProvider is missing from the component tree.');
    return client;
}

export function useApplicationWorkspace() {
    const client = useApplicationClient();
    return useSyncExternalStore(client.subscribe, client.getWorkspaceSnapshot, client.getWorkspaceSnapshot);
}

export function useApplicationSettings() {
    return useApplicationWorkspace().settings.values;
}

export async function updateApplicationSettings(client: ApplicationClient, changes: UserSettingsUpdate) {
    const expectedRevision = client.getWorkspaceSnapshot().settings.revision;
    const result = await client.execute({ type: 'settings.update', changes, expectedRevision });
    if (!result.ok) throw new Error(result.error.message);
    return result.settings;
}

export function useUpdateApplicationSettings() {
    const client = useApplicationClient();
    return useCallback((changes: UserSettingsUpdate) => updateApplicationSettings(client, changes), [client]);
}

import { useSyncExternalStore } from 'react';
import { getApplicationClient } from '../application/runtime';

export function useApplicationWorkspace() {
    const client = getApplicationClient();
    return useSyncExternalStore(client.subscribe, client.getWorkspaceSnapshot, client.getWorkspaceSnapshot);
}

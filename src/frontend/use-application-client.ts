import { useContext, useSyncExternalStore } from 'react';
import { ApplicationClientContext } from './application-client-context';

export function useApplicationClient() {
    const client = useContext(ApplicationClientContext);
    if (!client) throw new Error('ApplicationClientProvider is missing from the component tree.');
    return client;
}

export function useApplicationWorkspace() {
    const client = useApplicationClient();
    return useSyncExternalStore(client.subscribe, client.getWorkspaceSnapshot, client.getWorkspaceSnapshot);
}

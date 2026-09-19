import React from 'react';
import type { ApplicationClient } from '../application/application-client';
import { ApplicationClientContext } from './application-client-context';

export function ApplicationClientProvider({
    client,
    children,
}: {
    client: ApplicationClient;
    children: React.ReactNode;
}) {
    return <ApplicationClientContext.Provider value={client}>{children}</ApplicationClientContext.Provider>;
}

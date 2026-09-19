import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApplicationClient } from '../src/application/application-client.ts';
import type { WorkspaceSnapshot } from '../src/application/workspace-store.ts';
import { ApplicationClientProvider } from '../src/frontend/application-client-provider.tsx';
import { useApplicationClient, useApplicationWorkspace } from '../src/frontend/use-application-client.ts';

const snapshot = {
    device: null,
    imports: { revision: 3, items: [] },
    tasks: [],
    settings: { revision: 0, values: {} },
    library: { revision: 0, status: 'idle', entryCount: 0, error: null },
    encoder: { revision: 0, status: 'idle', index: null, id: null, name: null, error: null, support: {} },
} as WorkspaceSnapshot;

const client = {
    getWorkspaceSnapshot: () => snapshot,
    subscribe: () => () => undefined,
} as unknown as ApplicationClient;

function Probe() {
    const activeClient = useApplicationClient();
    const workspace = useApplicationWorkspace();
    return React.createElement('span', null, `${activeClient === client}:${workspace.imports.revision}`);
}

describe('ApplicationClientProvider', () => {
    it('gives the UI one injectable client and workspace subscription boundary', () => {
        const markup = renderToStaticMarkup(
            React.createElement(ApplicationClientProvider, { client }, React.createElement(Probe))
        );
        assert.equal(markup, '<span>true:3</span>');
    });

    it('fails clearly when a component bypasses the composition root', () => {
        assert.throws(() => renderToStaticMarkup(React.createElement(Probe)), /ApplicationClientProvider is missing/);
    });
});

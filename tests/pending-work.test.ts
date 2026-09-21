import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkspaceSnapshot } from '../src/application/workspace-store.ts';
import { hasPendingWorkspaceWork } from '../src/frontend/pending-work.ts';

function makeWorkspace(changes: Partial<WorkspaceSnapshot> = {}) {
    return {
        device: null,
        imports: { revision: 0, items: [] },
        tasks: [],
        settings: { revision: 0, values: {} },
        encoder: { revision: 0, status: 'idle', index: null, id: null, name: null, error: null, support: {} },
        ...changes,
    } as WorkspaceSnapshot;
}

describe('hasPendingWorkspaceWork', () => {
    it('warns for active tasks and device changes that still need flushing', () => {
        assert.equal(
            hasPendingWorkspaceWork(makeWorkspace({ tasks: [{ status: 'running' } as WorkspaceSnapshot['tasks'][number]] })),
            true
        );
        assert.equal(
            hasPendingWorkspaceWork(
                makeWorkspace({
                    device: { status: { canBeFlushed: true } } as WorkspaceSnapshot['device'],
                })
            ),
            true
        );
    });

    it('allows navigation when the workspace is idle and clean', () => {
        assert.equal(hasPendingWorkspaceWork(makeWorkspace()), false);
    });
});

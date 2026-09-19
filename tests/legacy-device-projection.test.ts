import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceSnapshot } from '../src/application/contracts.ts';
import type { WorkspaceSnapshot } from '../src/application/workspace-store.ts';
import { subscribeLegacyDeviceProjection } from '../src/frontend/legacy-device-projection.ts';
import { applyDeviceSnapshot } from '../src/redux/application-adapter.ts';
import type { AppDispatch } from '../src/redux/store.ts';
import { Capability } from '../src/services/interfaces/capabilities.ts';

describe('legacy device projection', () => {
    it('projects only device reference changes and clears the legacy state on disconnect', () => {
        const listeners = new Set<() => void>();
        let workspace = { device: null } as WorkspaceSnapshot;
        const source = {
            getWorkspaceSnapshot: () => workspace,
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const projected: Array<DeviceSnapshot | null> = [];
        const unsubscribe = subscribeLegacyDeviceProjection(source, (snapshot) => projected.push(snapshot));

        for (const listener of listeners) listener();
        assert.deepEqual(projected, [null]);

        const device = { sessionId: 'session-1', revision: 1 } as DeviceSnapshot;
        workspace = { ...workspace, device };
        for (const listener of listeners) listener();
        workspace = { ...workspace };
        for (const listener of listeners) listener();
        assert.deepEqual(projected, [null, device]);

        workspace = { ...workspace, device: null };
        for (const listener of listeners) listener();
        assert.deepEqual(projected, [null, device, null]);

        unsubscribe();
        workspace = { ...workspace, device };
        for (const listener of listeners) listener();
        assert.deepEqual(projected, [null, device, null]);
    });

    it('resets the complete legacy device projection when the workspace disconnects', () => {
        const dispatched: unknown[] = [];
        const dispatch = ((action: unknown) => {
            dispatched.push(action);
            return action;
        }) as AppDispatch;

        applyDeviceSnapshot(dispatch, null);

        const batch = dispatched[0] as { payload: Array<{ type: string; payload: unknown }> };
        assert.deepEqual(
            batch.payload.map((action) => [action.type, action.payload]),
            [
                ['main/setDisc', null],
                ['main/setDeviceName', ''],
                ['main/setDeviceStatus', null],
                ['main/setDeviceCapabilities', [Capability.contentList]],
            ]
        );
    });
});

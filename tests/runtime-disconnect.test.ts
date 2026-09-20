import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureApplicationCommandBus, getApplicationClient } from '../src/application/runtime.ts';
import type { DeviceSnapshot } from '../src/application/contracts.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import serviceRegistry from '../src/services/registry.ts';
import type { MinidiscSpec, NetMDService } from '../src/services/interfaces/netmd.ts';

function makeApplication(revision: number, sessionId: string) {
    const snapshot = {
        revision,
        sessionId,
        state: 'ready',
        disc: null,
        capabilities: [],
    } as unknown as DeviceSnapshot;
    return {
        readSnapshot: () => snapshot,
        subscribe: () => () => undefined,
        refresh: async () => snapshot,
    } as unknown as MiniDiscApplication;
}

function attachRuntime(application: MiniDiscApplication, service: NetMDService, name: string) {
    serviceRegistry.application = application;
    serviceRegistry.netmdService = service;
    serviceRegistry.netmdSpec = {} as MinidiscSpec;
    serviceRegistry.netmdFactoryService = {} as never;
    serviceRegistry.workspaceStore.attachApplication(application);
    serviceRegistry.workspaceStore.setConnection({
        phase: 'connected',
        serviceName: name,
        method: 'cached',
        message: null,
    });
    ensureApplicationCommandBus().attachApplication(application);
}

describe('browser runtime disconnect recovery', () => {
    it('interrupts active work, preserves the import plan, detaches every device boundary, and accepts a fresh session', async () => {
        let firstFinalizeCount = 0;
        const firstService = {
            async finalize() {
                firstFinalizeCount += 1;
            },
        } as NetMDService;
        const firstApplication = makeApplication(4, 'first-session');
        attachRuntime(firstApplication, firstService, 'USB NetMD');

        const queued = serviceRegistry.taskManager.create('disc.write', 'Queued write', 2, 'tracks');
        const running = serviceRegistry.taskManager.create('track.export', 'Running export', 2, 'tracks');
        serviceRegistry.taskManager.start(running.id, 'transferring');
        serviceRegistry.importQueue.add([
            {
                source: { kind: 'local-path', name: 'pending.wav', reference: 'bridge-file:pending' },
                metadata: { title: 'Pending track', duration: 4 },
            },
        ]);

        const client = getApplicationClient();
        await client.disconnectLocalDevice(false);

        const disconnected = client.getWorkspaceSnapshot();
        assert.equal(disconnected.connection.phase, 'disconnected');
        assert.equal(disconnected.device, null);
        assert.equal(disconnected.imports.items[0]?.title, 'Pending track');
        assert.equal(disconnected.tasks.find((task) => task.id === queued.id)?.status, 'interrupted');
        assert.equal(disconnected.tasks.find((task) => task.id === running.id)?.status, 'interrupted');
        assert.match(
            disconnected.tasks.find((task) => task.id === running.id)?.error?.recoveryAction ?? '',
            /Reconnect the device/
        );
        assert.equal(serviceRegistry.application, undefined);
        assert.equal(serviceRegistry.netmdService, undefined);
        assert.equal(serviceRegistry.netmdSpec, undefined);
        assert.equal(serviceRegistry.netmdFactoryService, undefined);
        assert.equal(firstFinalizeCount, 0);

        const detachedCommand = await client.execute({ type: 'disc.refresh' });
        assert.equal(detachedCommand.ok, false);
        assert.equal(!detachedCommand.ok && detachedCommand.error.code, 'DEVICE_NOT_CONNECTED');

        let secondFinalizeCount = 0;
        const secondService = {
            async finalize() {
                secondFinalizeCount += 1;
            },
        } as NetMDService;
        const secondApplication = makeApplication(1, 'second-session');
        attachRuntime(secondApplication, secondService, 'USB NetMD');

        const refreshed = await client.execute({ type: 'disc.refresh' });
        assert.equal(refreshed.ok && refreshed.snapshot?.sessionId, 'second-session');
        assert.equal(client.getWorkspaceSnapshot().imports.items[0]?.title, 'Pending track');

        await client.disconnectLocalDevice(true);
        assert.equal(secondFinalizeCount, 1);
        assert.equal(client.getWorkspaceSnapshot().connection.phase, 'disconnected');
        assert.equal(client.getWorkspaceSnapshot().device, null);

        const cleanupWarnings: unknown[][] = [];
        const originalWarn = console.warn;
        const vanishedService = {
            async finalize() {
                throw new Error('The USB interface has already disappeared.');
            },
        } as NetMDService;
        attachRuntime(makeApplication(2, 'vanished-session'), vanishedService, 'USB NetMD');
        console.warn = (...values: unknown[]) => cleanupWarnings.push(values);
        try {
            await client.disconnectLocalDevice(true);
        } finally {
            console.warn = originalWarn;
        }

        assert.equal(client.getWorkspaceSnapshot().connection.phase, 'disconnected');
        assert.equal(client.getWorkspaceSnapshot().device, null);
        assert.equal(serviceRegistry.netmdService, undefined);
        assert.match(String(cleanupWarnings[0]?.[0]), /Could not finalize/);
        assert.match(String((cleanupWarnings[0]?.[1] as Error)?.message), /already disappeared/);
    });
});

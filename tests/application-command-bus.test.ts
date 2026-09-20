import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationCommandBus } from '../src/application/command-bus.ts';
import { ImportQueue, type ImportWriter } from '../src/application/import-queue.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { SettingsStore } from '../src/application/settings-store.ts';
import { WorkspaceStore } from '../src/application/workspace-store.ts';
import type { TrackRecorder } from '../src/application/track-record.ts';
import { LibraryCatalog } from '../src/application/library-catalog.ts';

describe('ApplicationCommandBus import writing', () => {
    it('returns a detached copy of the serializable service catalog without a device', async () => {
        const catalog = {
            audioEncoders: [
                { index: 0, id: 'encoder', name: 'Encoder', available: true, parameters: [] },
            ],
            libraries: [],
        };
        const bus = new ApplicationCommandBus(
            undefined,
            new TaskManager(),
            new ImportQueue(),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            catalog
        );

        const first = await bus.execute({ type: 'services.get' });
        assert.equal(first.ok && first.services?.audioEncoders[0].id, 'encoder');
        if (first.ok && first.services) first.services.audioEncoders[0].name = 'Changed';

        const second = await bus.execute({ type: 'services.get' });
        assert.equal(second.ok && second.services?.audioEncoders[0].name, 'Encoder');
    });

    it('keeps settings and import planning available without a connected device', async () => {
        const settings = new SettingsStore(null);
        const imports = new ImportQueue();
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), imports, undefined, undefined, settings);

        const updatedSettings = await bus.execute({ type: 'settings.update', changes: { colorTheme: 'dark' } });
        const addedImport = await bus.execute({
            type: 'import.add',
            inputs: [
                {
                    source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                    metadata: { title: 'Track' },
                },
            ],
        });

        assert.equal(updatedSettings.ok && updatedSettings.settings?.values.colorTheme, 'dark');
        assert.equal(addedImport.ok && addedImport.importQueue?.items[0]?.name, 'track.wav');
    });

    it('rejects malformed import metadata from serializable clients without changing the queue', async () => {
        const imports = new ImportQueue();
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), imports);
        const added = await bus.execute({
            type: 'import.add',
            inputs: [
                {
                    source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                    metadata: { title: 'Track' },
                },
            ],
        });
        assert.equal(added.ok, true);
        const id = added.ok ? added.importQueue!.items[0].id : '';
        const revision = added.ok ? added.importQueue!.revision : -1;

        const empty = await bus.execute({ type: 'import.update', id, changes: {}, expectedRevision: revision });
        const unknown = await bus.execute({
            type: 'import.update',
            id,
            changes: { injected: 'value' } as any,
            expectedRevision: revision,
        });

        assert.equal(empty.ok, false);
        assert.equal(!empty.ok && empty.error.code, 'INVALID_INPUT');
        assert.equal(unknown.ok, false);
        assert.equal(!unknown.ok && unknown.error.code, 'INVALID_INPUT');
        assert.equal(imports.snapshot().revision, revision);
        assert.equal('injected' in imports.snapshot().items[0], false);
    });

    it('returns one disconnected workspace snapshot for UI and automation clients', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const settings = new SettingsStore(null);
        const workspace = new WorkspaceStore(tasks, imports, settings);
        const bus = new ApplicationCommandBus(undefined, tasks, imports, undefined, undefined, settings, workspace);
        imports.add([
            {
                source: { kind: 'local-path', name: 'queued.wav', reference: 'bridge-file:queued' },
                metadata: { title: 'Queued' },
            },
        ]);
        settings.update({ colorTheme: 'dark' });

        const result = await bus.execute({ type: 'workspace.get' });

        assert.equal(result.ok && result.workspace?.connection.phase, 'disconnected');
        assert.equal(result.ok && result.workspace?.device, null);
        assert.equal(result.ok && result.workspace?.imports.items[0]?.title, 'Queued');
        assert.equal(result.ok && result.workspace?.settings.values.colorTheme, 'dark');
        assert.deepEqual(result.ok && result.workspace?.tasks, []);
    });

    it('refreshes the configured library without requiring a device connection', async () => {
        const database = {
            'track.wav': { artist: 'Artist', album: 'Album', title: 'Track', duration: 3 },
        };
        const catalog = new LibraryCatalog(() => ({
            async getDatabase() {
                return database;
            },
            async processLocalLibraryFile() {
                return new ArrayBuffer(0);
            },
        }));
        const bus = new ApplicationCommandBus(
            undefined,
            new TaskManager(),
            new ImportQueue(),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            catalog,
            (paths, expectedLibraryRevision) =>
                catalog.resolveTracks(paths, expectedLibraryRevision).map((selection) => ({
                    source: { kind: 'library', name: selection.name, reference: selection.path.join('/') },
                    metadata: { title: selection.metadata.title, duration: selection.metadata.duration },
                    payload: { local: true },
                }))
        );

        const result = await bus.execute({ type: 'library.refreshSummary' });
        const page = await bus.execute({ type: 'library.list', limit: 10, expectedRevision: 1 });
        const search = await bus.execute({ type: 'library.search', query: 'artist', limit: 10, expectedRevision: 1 });
        const imported = await bus.execute({
            type: 'library.import',
            paths: [['track.wav']],
            expectedLibraryRevision: 1,
            expectedImportRevision: 0,
        });

        assert.equal(result.ok && result.libraryState?.status, 'ready');
        assert.equal(result.ok && result.libraryState?.entryCount, 1);
        assert.deepEqual(page.ok && page.libraryPage?.items, [
            { kind: 'track', name: 'track.wav', artist: 'Artist', album: 'Album', title: 'Track', duration: 3 },
        ]);
        assert.deepEqual(search.ok && search.librarySearch?.items[0]?.path, ['track.wav']);
        assert.equal(imported.ok && imported.importQueue?.items[0].kind, 'library');
        assert.equal(imported.ok && imported.importQueue?.items[0].title, 'Track');
    });

    it('returns a structured disconnected error only for commands that need a device', async () => {
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), new ImportQueue());

        const result = await bus.execute({ type: 'disc.refresh' });

        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'DEVICE_NOT_CONNECTED',
                message: 'Connect a MiniDisc device in the application before using device commands.',
                details: undefined,
            },
        });
    });

    it('restores device commands when an application session is attached', async () => {
        const application = { refresh: async () => ({ revision: 7 }) } as unknown as MiniDiscApplication;
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), new ImportQueue());
        bus.attachApplication(application);

        const result = await bus.execute({ type: 'disc.refresh' });

        assert.equal(result.ok && result.snapshot?.revision, 7);
    });

    it('routes confirmed raw TOC writes through the application boundary', async () => {
        let receivedBytes = '';
        let receivedExpectedHash: string | undefined;
        const preview = {
            byteLength: 14112,
            currentSha256: 'a'.repeat(64),
            proposedSha256: 'b'.repeat(64),
            currentWritableSha256: 'c'.repeat(64),
            proposedWritableSha256: 'd'.repeat(64),
            changedWritableBytes: 2,
            changedWritableSectors: [0, 2],
        };
        const application = {
            async previewRawTocWrite() {
                return preview;
            },
            async writeRawToc(
                dataBase64: string,
                _confirmation: unknown,
                _expectedRevision: unknown,
                _interactiveAuthorization: unknown,
                expectedCurrentTocSha256?: string
            ) {
                receivedBytes = dataBase64;
                receivedExpectedHash = expectedCurrentTocSha256;
                return { revision: 8 };
            },
        } as unknown as MiniDiscApplication;
        const bus = new ApplicationCommandBus(application, new TaskManager(), new ImportQueue());

        const previewResult = await bus.execute({ type: 'advanced.previewTocWrite', dataBase64: 'dG9j' });
        const result = await bus.execute({
            type: 'advanced.writeToc',
            dataBase64: 'dG9j',
            confirmation: { confirmed: true, reason: 'Confirmed in test.' },
            expectedRevision: 7,
            expectedCurrentTocSha256: 'a'.repeat(64),
        });

        assert.deepEqual(previewResult.ok && previewResult.advancedTocWritePreview, preview);
        assert.equal(receivedBytes, 'dG9j');
        assert.equal(receivedExpectedHash, 'a'.repeat(64));
        assert.equal(result.ok && result.snapshot?.revision, 8);
    });

    it('routes raw TOC flag previews and browser-authorized applications', async () => {
        let appliedKind = '';
        let appliedHash = '';
        const preview = {
            kind: 'unrestrict-scms' as const,
            totalTracks: 2,
            changedTracks: 1,
            changedFragments: 2,
            currentSha256: 'a'.repeat(64),
            proposedSha256: 'b'.repeat(64),
            currentWritableSha256: 'c'.repeat(64),
            proposedWritableSha256: 'd'.repeat(64),
        };
        const application = {
            async previewRawTocPatch() {
                return preview;
            },
            async applyRawTocPatch(kind: string, expectedHash: string) {
                appliedKind = kind;
                appliedHash = expectedHash;
                return { revision: 9 };
            },
        } as unknown as MiniDiscApplication;
        const bus = new ApplicationCommandBus(application, new TaskManager(), new ImportQueue());

        const previewResult = await bus.execute({ type: 'advanced.previewTocPatch', kind: 'unrestrict-scms' });
        const applyResult = await bus.execute({
            type: 'advanced.applyTocPatch',
            kind: 'unrestrict-scms',
            expectedCurrentTocSha256: preview.currentSha256,
            confirmation: { confirmed: true, reason: 'Confirmed in test.' },
            expectedRevision: 8,
        });

        assert.deepEqual(previewResult.ok && previewResult.advancedTocPatch, preview);
        assert.equal(appliedKind, 'unrestrict-scms');
        assert.equal(appliedHash, preview.currentSha256);
        assert.equal(applyResult.ok && applyResult.snapshot?.revision, 9);
    });

    it('rejects unknown runtime commands instead of reporting a false success', async () => {
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, new TaskManager(), new ImportQueue());
        const result = await bus.execute({ type: 'unknown.command' } as any);
        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'INVALID_COMMAND',
                message: 'Unknown application command: unknown.command',
                details: undefined,
            },
        });
    });

    it('rejects a write cancellation command that cannot skip any remaining track', async () => {
        const tasks = new TaskManager();
        const task = tasks.create('disc.write', 'Write one track', 1, 'tracks');
        tasks.start(task.id, 'transferring');
        const bus = new ApplicationCommandBus(undefined, tasks, new ImportQueue());

        const result = await bus.execute({ type: 'task.cancel', id: task.id });

        assert.equal(result.ok, false);
        assert.match(!result.ok ? result.error.message : '', /cannot be interrupted safely/);
        assert.equal(tasks.get(task.id).cancellationRequested, false);
    });

    it('starts a background write through the injected application adapter', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const added = imports.add([
            {
                source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                metadata: { title: 'Track' },
            },
        ]);
        let receivedFormat: { codec: string; bitrate: number } | undefined;
        const writer: ImportWriter = {
            async start(request, queue, taskManager) {
                queue.resolveSelection(request.ids, request.expectedRevision);
                receivedFormat = request.format;
                return taskManager.create('disc.write', 'Write one track', 1, 'tracks');
            },
        };
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, tasks, imports, writer);
        const result = await bus.execute({
            type: 'import.write',
            format: { codec: 'AT3', bitrate: 132 },
            expectedRevision: added.revision,
        });

        assert.equal(result.ok, true);
        assert.equal(result.ok && result.task?.kind, 'disc.write');
        assert.deepEqual(receivedFormat, { codec: 'AT3', bitrate: 132 });
    });

    it('previews the exact queue revision through the connected application', async () => {
        const imports = new ImportQueue();
        const added = imports.add([
            {
                source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                metadata: { title: 'Track', duration: 60 },
            },
        ]);
        let receivedImportRevision = -1;
        const application = {
            async previewImports(items: unknown[], importRevision: number) {
                receivedImportRevision = importRevision;
                return {
                    deviceSessionId: 'session',
                    deviceRevision: 3,
                    importRevision,
                    selectedIds: [(items[0] as { id: string }).id],
                    selectedFormat: { codec: 'SPS', bitrate: 292 },
                    measurementUnits: 'frames',
                    complete: true,
                    issues: [],
                    capacity: {
                        availableBefore: 600,
                        required: 60,
                        remaining: 540,
                        availableBeforeInSelectedFormat: 600,
                        remainingInSelectedFormat: 540,
                        fits: true,
                    },
                    titles: {
                        halfWidthBefore: 1785,
                        fullWidthBefore: 1785,
                        halfWidthRemaining: 1778,
                        fullWidthRemaining: 1785,
                        fits: true,
                    },
                };
            },
        } as unknown as MiniDiscApplication;
        const bus = new ApplicationCommandBus(application, new TaskManager(), imports);

        const result = await bus.execute({ type: 'import.preview', expectedImportRevision: added.revision });

        assert.equal(receivedImportRevision, added.revision);
        assert.equal(result.ok && result.importPreview?.capacity.remaining, 540);
        assert.equal(result.ok && result.importPreview?.selectedIds.length, 1);
    });

    it('returns a structured failure when no write adapter is available', async () => {
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, new TaskManager(), new ImportQueue());
        const result = await bus.execute({ type: 'import.write' });
        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'UNEXPECTED_ERROR',
                message: 'Audio writing is unavailable in this application environment.',
                details: undefined,
            },
        });
    });

    it('starts audio-input recording through the injected application adapter', async () => {
        const tasks = new TaskManager();
        let receivedDeviceId = '';
        const recorder: TrackRecorder = {
            async start(request, _application, taskManager) {
                receivedDeviceId = request.deviceId;
                return taskManager.create('track.record', 'Record one track', 1, 'tracks');
            },
        };
        const bus = new ApplicationCommandBus(
            {} as MiniDiscApplication,
            tasks,
            new ImportQueue(),
            undefined,
            undefined,
            new SettingsStore(null),
            undefined,
            recorder
        );

        const result = await bus.execute({ type: 'track.record', indexes: [0], deviceId: 'line-in' });

        assert.equal(result.ok && result.task?.kind, 'track.record');
        assert.equal(receivedDeviceId, 'line-in');
    });

    it('updates shared settings but rejects attempts to enable the local bridge', async () => {
        const settings = new SettingsStore(null);
        const serviceCatalog = {
            audioEncoders: [
                {
                    index: 0,
                    id: 'at3re',
                    name: 'At3RE',
                    available: false,
                    unavailableReason: 'Not bundled',
                    parameters: [],
                },
                { index: 1, id: 'atracdenc', name: 'Atracdenc', available: true, parameters: [] },
            ],
            libraries: [],
            devices: [],
        };
        const bus = new ApplicationCommandBus(
            {} as MiniDiscApplication,
            new TaskManager(),
            new ImportQueue(),
            undefined,
            undefined,
            settings,
            undefined,
            undefined,
            undefined,
            undefined,
            serviceCatalog
        );

        const updated = await bus.execute({
            type: 'settings.update',
            changes: { colorTheme: 'dark', audioEncoderId: 'atracdenc' },
            expectedRevision: 0,
        });
        const rejected = await bus.execute({
            type: 'settings.update',
            changes: { minidiscLocalBridgeEnabled: true },
        } as any);
        const unavailableEncoder = await bus.execute({
            type: 'settings.update',
            changes: { audioEncoderId: 'at3re' },
        });

        assert.equal(updated.ok && updated.settings?.values.colorTheme, 'dark');
        assert.equal(updated.ok && updated.settings?.values.audioEncoderId, 'atracdenc');
        assert.equal(updated.ok && updated.settings?.values.audioExportService, 1);
        assert.equal(rejected.ok, false);
        assert.equal(!rejected.ok && rejected.error.code, 'INVALID_INPUT');
        assert.equal(unavailableEncoder.ok, false);
        assert.equal(!unavailableEncoder.ok && unavailableEncoder.error.code, 'INVALID_INPUT');
    });
});

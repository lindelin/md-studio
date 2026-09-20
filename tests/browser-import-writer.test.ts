import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AudioExportService } from '../src/services/audio/audio-export.ts';
import type { AdvancedUploadService, DeviceSnapshot, DeviceUploadService } from '../src/application/contracts.ts';
import { BrowserImportWriter } from '../src/application/browser-import-writer.ts';
import { BrowserLocalFileGateway } from '../src/application/browser-local-file-gateway.ts';
import { ImportQueue } from '../src/application/import-queue.ts';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from '../src/application/interactive-authorization.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager, type TaskSnapshot } from '../src/application/task-manager.ts';

const snapshot: DeviceSnapshot = {
    sessionId: 'session-1',
    revision: 4,
    deviceName: 'MockMD',
    status: { discPresent: true, canBeFlushed: false, state: 'stopped', track: 0 } as any,
    capabilities: ['content.read', 'track.upload', 'advanced.factory', 'metadata.fullWidth'],
    recording: {
        specName: 'MD',
        measurementUnits: 'frames',
        titleStorage: 'netmd-toc',
        defaultFormat: [0, 0],
        availableFormats: [{ codec: 'AT3', defaultBitrate: 132, availableBitrates: [132] }],
    },
    disc: {
        title: 'Test',
        fullWidthTitle: '',
        writable: true,
        writeProtected: false,
        used: 0,
        left: 10_000,
        total: 10_000,
        trackCount: 0,
        groups: [],
    } as any,
};

function makePreview(format = { codec: 'AT3', bitrate: 132 }) {
    return {
        deviceSessionId: snapshot.sessionId,
        deviceRevision: snapshot.revision,
        importRevision: 1,
        selectedIds: ['unused'],
        selectedFormat: format,
        measurementUnits: 'frames' as const,
        complete: true,
        issues: [],
        homebrew: { requiredCapabilities: [] },
        capacity: {
            availableBefore: 10_000,
            required: 100,
            remaining: 9_900,
            availableBeforeInSelectedFormat: 10_000,
            remainingInSelectedFormat: 9_900,
            fits: true,
        },
        titles: {
            halfWidthBefore: 1_000,
            fullWidthBefore: 1_000,
            halfWidthRemaining: 900,
            fullWidthRemaining: 900,
            fits: true,
        },
    };
}

function makeUploadService(upload: DeviceUploadService['upload']): DeviceUploadService {
    return {
        async prepareUpload() {},
        async finalizeUpload() {},
        upload,
        getRemainingCharactersForTitles: () => ({ halfWidth: 1_000, fullWidth: 1_000 }),
        sanitizeHalfWidthTitle: (title) => title,
        sanitizeFullWidthTitle: (title) => title,
    };
}

function makeApplication(
    upload: DeviceUploadService['upload'],
    options: { format?: { codec: string; bitrate: number }; onSession?: (capabilities: string[]) => void } = {}
) {
    const service = makeUploadService(upload);
    const advancedService: AdvancedUploadService = {
        async uploadSP(_title, _fullWidthTitle, _mono, data, onProgress) {
            onProgress({ written: data.byteLength, encrypted: data.byteLength, total: data.byteLength });
            return 1;
        },
        async enableMonoUpload() {},
    };
    return {
        readSnapshot: () => structuredClone(snapshot),
        refresh: async () => structuredClone(snapshot),
        previewImports: async () => makePreview(options.format as any),
        runDeviceUploadSession: async (
            capabilities: string[],
            _authorization: unknown,
            operation: (uploadService: DeviceUploadService, advancedUploadService?: AdvancedUploadService) => Promise<unknown>
        ) => {
            options.onSession?.(capabilities);
            const value = await operation(service, advancedService);
            return { value, snapshot: structuredClone(snapshot) };
        },
    } as unknown as MiniDiscApplication;
}

function makeAudioExporter(): AudioExportService {
    return {
        name: 'Test encoder',
        supportedCodecs: {},
        async init() {},
        async prepare() {},
        async export(_params, onProgress) {
            onProgress({ state: 1, total: 1 });
            return Uint8Array.from([1, 2, 3, 4]).buffer;
        },
    } as AudioExportService;
}

function addTracks(queue: ImportQueue, count: number, forcedEncoding?: { codec: string; bitrate: number } | null) {
    return queue.add(
        Array.from({ length: count }, (_, index) => ({
            source: { kind: 'browser-file' as const, name: `track-${index + 1}.wav`, reference: `browser:${index}` },
            metadata: { title: `Track ${index + 1}`, duration: 30, forcedEncoding },
            payload: new File([Uint8Array.from([1, 2, 3, 4])], `track-${index + 1}.wav`),
        }))
    );
}

async function waitForFinished(tasks: TaskManager, id: string) {
    const current = tasks.get(id);
    if (current.status !== 'queued' && current.status !== 'running') return current;
    return new Promise<TaskSnapshot>((resolve) => {
        const unsubscribe = tasks.subscribe((task) => {
            if (task.id !== id || task.status === 'queued' || task.status === 'running') return;
            unsubscribe();
            resolve(task);
        });
    });
}

describe('BrowserImportWriter', () => {
    it('owns conversion, device upload, task progress, and queue cleanup', async () => {
        const uploads: string[] = [];
        const tasks = new TaskManager();
        const queue = new ImportQueue();
        const added = addTracks(queue, 2);
        let notified = 0;
        const application = makeApplication(async (title, _fullWidthTitle, data, _format, onProgress) => {
            uploads.push(typeof title === 'string' ? title : title.title);
            onProgress({ written: data.byteLength, encrypted: data.byteLength, total: data.byteLength });
        });
        const writer = new BrowserImportWriter({
            getApplication: () => application,
            getAudioExportService: async () => makeAudioExporter(),
            getUseFullWidthTitles: () => true,
            localFiles: new BrowserLocalFileGateway(),
            notifyCompleted: () => (notified += 1),
        });

        const started = await writer.start(
            {
                format: { codec: 'AT3', bitrate: 132 },
                expectedRevision: added.revision,
                removeOnSuccess: true,
            },
            queue,
            tasks
        );
        const finished = await waitForFinished(tasks, started.id);

        assert.equal(finished.status, 'succeeded');
        assert.deepEqual(finished.result, { writtenTracks: 2 });
        assert.deepEqual(uploads, ['Track 1', 'Track 2']);
        assert.equal(queue.snapshot().items.length, 0);
        assert.equal(notified, 1);
        assert.equal(finished.progress.stages?.conversion.completed, 2);
        assert.equal(finished.progress.stages?.transfer.completed, 4);
        assert.equal(finished.progress.stages?.transfer.buffered, 4);
    });

    it('uses the native reviewed browser authorization without a second confirmation prompt', async () => {
        const tasks = new TaskManager();
        const queue = new ImportQueue();
        const added = addTracks(queue, 1, { codec: 'SPS', bitrate: 292 });
        let sessions = 0;
        const writer = new BrowserImportWriter({
            getApplication: () =>
                makeApplication(async () => undefined, {
                    format: { codec: 'SPS', bitrate: 292 },
                    onSession: () => (sessions += 1),
                }),
            getAudioExportService: async () => makeAudioExporter(),
            getUseFullWidthTitles: () => false,
            localFiles: new BrowserLocalFileGateway(),
        });

        const started = await writer.start(
            {
                format: { codec: 'SPS', bitrate: 292 },
                expectedRevision: added.revision,
                interactiveHomebrewAuthorization: INTERACTIVE_HOMEBREW_AUTHORIZATION,
            },
            queue,
            tasks
        );
        const finished = await waitForFinished(tasks, started.id);

        assert.equal(finished.status, 'succeeded');
        assert.equal(sessions, 1);
    });

    it('preserves completed-item evidence and the queue after a partial transfer failure', async () => {
        const tasks = new TaskManager();
        const queue = new ImportQueue();
        const added = addTracks(queue, 2);
        let uploadCount = 0;
        const writer = new BrowserImportWriter({
            getApplication: () =>
                makeApplication(async (_title, _fullWidthTitle, data, _format, onProgress) => {
                    uploadCount += 1;
                    if (uploadCount === 2) throw new Error('USB transfer failed');
                    onProgress({ written: data.byteLength, encrypted: data.byteLength, total: data.byteLength });
                }),
            getAudioExportService: async () => makeAudioExporter(),
            getUseFullWidthTitles: () => false,
            localFiles: new BrowserLocalFileGateway(),
        });

        const started = await writer.start(
            {
                format: { codec: 'AT3', bitrate: 132 },
                expectedRevision: added.revision,
                removeOnSuccess: true,
            },
            queue,
            tasks
        );
        const finished = await waitForFinished(tasks, started.id);

        assert.equal(finished.status, 'failed');
        assert.equal(finished.error?.completedItems, 1);
        assert.equal(finished.error?.pendingItems, 1);
        assert.equal(queue.snapshot().items.length, 2);
        assert.equal(finished.error?.message, 'USB transfer failed');
        assert.match(
            String(finished.error?.details?.displayMessage ?? ''),
            /recording task stopped before all tracks were transferred/i
        );
    });

    it('does not turn a successful write into an error when the UI removes a queued item during transfer', async () => {
        const tasks = new TaskManager();
        const queue = new ImportQueue();
        const added = addTracks(queue, 2);
        let releaseFirstUpload!: () => void;
        const firstUploadStarted = new Promise<void>((resolve) => {
            releaseFirstUpload = resolve;
        });
        let allowUploadToFinish!: () => void;
        const uploadMayFinish = new Promise<void>((resolve) => {
            allowUploadToFinish = resolve;
        });
        let uploadCount = 0;
        const writer = new BrowserImportWriter({
            getApplication: () =>
                makeApplication(async () => {
                    uploadCount += 1;
                    if (uploadCount === 1) {
                        releaseFirstUpload();
                        await uploadMayFinish;
                    }
                }),
            getAudioExportService: async () => makeAudioExporter(),
            getUseFullWidthTitles: () => false,
            localFiles: new BrowserLocalFileGateway(),
        });

        const started = await writer.start(
            {
                format: { codec: 'AT3', bitrate: 132 },
                expectedRevision: added.revision,
                removeOnSuccess: true,
            },
            queue,
            tasks
        );
        await firstUploadStarted;
        queue.remove([added.items[0].id]);
        allowUploadToFinish();
        const finished = await waitForFinished(tasks, started.id);

        assert.equal(finished.status, 'succeeded');
        assert.equal(queue.snapshot().items.length, 0);
    });

    it('transcodes an MP3 import when the selected device format is not MP3', async () => {
        const tasks = new TaskManager();
        const queue = new ImportQueue();
        const added = queue.add([
            {
                source: { kind: 'browser-file', name: 'source.mp3', reference: 'browser:mp3' },
                metadata: {
                    title: 'MP3 source',
                    duration: 30,
                    forcedEncoding: { codec: 'MP3', bitrate: 192 },
                    bytesToSkip: 0,
                },
                payload: new File([Uint8Array.from([9, 8])], 'source.mp3'),
            },
        ]);
        let prepareCount = 0;
        let uploaded = new Uint8Array();
        const exporter = makeAudioExporter();
        exporter.prepare = async () => {
            prepareCount += 1;
        };
        const writer = new BrowserImportWriter({
            getApplication: () =>
                makeApplication(async (_title, _fullWidthTitle, data) => {
                    uploaded = new Uint8Array(data);
                }),
            getAudioExportService: async () => exporter,
            getUseFullWidthTitles: () => false,
            localFiles: new BrowserLocalFileGateway(),
        });

        const started = await writer.start(
            {
                format: { codec: 'AT3', bitrate: 132 },
                expectedRevision: added.revision,
            },
            queue,
            tasks
        );
        const finished = await waitForFinished(tasks, started.id);

        assert.equal(finished.status, 'succeeded');
        assert.equal(prepareCount, 1);
        assert.deepEqual([...uploaded], [1, 2, 3, 4]);
    });
});

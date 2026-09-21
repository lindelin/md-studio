import type { DeviceSnapshot } from './contracts';
import type { ImportQueue, ImportQueueSnapshot } from './import-queue';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskSnapshot } from './task-manager';
import type { SettingsSnapshot, SettingsStore } from './settings-store';
import type { AudioEncoderManager, AudioEncoderSnapshot } from './audio-encoder-manager';

export interface DeviceConnectionSnapshot {
    phase: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';
    serviceName: string | null;
    method: 'cached' | 'paired' | null;
    message: string | null;
}

export interface WorkspaceSnapshot {
    connection: DeviceConnectionSnapshot;
    device: DeviceSnapshot | null;
    imports: ImportQueueSnapshot;
    tasks: TaskSnapshot[];
    settings: SettingsSnapshot;
    encoder: AudioEncoderSnapshot;
}

type WorkspaceListener = () => void;

function freezeSnapshot<T>(value: T): T {
    if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeSnapshot(child);
    return Object.freeze(value);
}

export class WorkspaceStore {
    private snapshot: WorkspaceSnapshot;
    private readonly listeners = new Set<WorkspaceListener>();
    private detachDevice?: () => void;

    constructor(
        private readonly taskManager: TaskManager,
        private readonly importQueue: ImportQueue,
        settingsStore: SettingsStore,
        audioEncoderManager?: AudioEncoderManager
    ) {
        this.snapshot = freezeSnapshot({
            connection: {
                phase: 'disconnected',
                serviceName: null,
                method: null,
                message: null,
            },
            device: null,
            imports: importQueue.snapshot(),
            tasks: taskManager.list(),
            settings: settingsStore.getSnapshot(),
            encoder: audioEncoderManager?.getSnapshot() ?? {
                revision: 0,
                status: 'idle',
                index: null,
                id: null,
                name: null,
                error: null,
                support: {},
            },
        });
        taskManager.subscribe(() => this.update({ tasks: taskManager.list() }));
        importQueue.subscribe((imports) => this.update({ imports }));
        settingsStore.subscribe((settings) => this.update({ settings }));
        audioEncoderManager?.subscribe((encoder) => this.update({ encoder }));
    }

    getSnapshot = () => this.snapshot;

    subscribe = (listener: WorkspaceListener) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    attachApplication(application: MiniDiscApplication) {
        this.detachDevice?.();
        this.detachDevice = application.subscribe((device) => this.update({ device }));
        this.update({ device: application.readSnapshot() });
    }

    detachApplication() {
        this.detachDevice?.();
        this.detachDevice = undefined;
        this.update({ device: null });
    }

    setConnection(connection: DeviceConnectionSnapshot) {
        this.update({ connection });
    }

    private update(changes: Partial<WorkspaceSnapshot>) {
        this.snapshot = freezeSnapshot({ ...this.snapshot, ...structuredClone(changes) });
        for (const listener of this.listeners) listener();
    }
}

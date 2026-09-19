import type { DeviceSnapshot } from './contracts';
import type { ImportQueue, ImportQueueSnapshot } from './import-queue';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskSnapshot } from './task-manager';

export interface WorkspaceSnapshot {
    device: DeviceSnapshot | null;
    imports: ImportQueueSnapshot;
    tasks: TaskSnapshot[];
}

type WorkspaceListener = () => void;

export class WorkspaceStore {
    private snapshot: WorkspaceSnapshot;
    private readonly listeners = new Set<WorkspaceListener>();
    private detachDevice?: () => void;

    constructor(
        private readonly taskManager: TaskManager,
        private readonly importQueue: ImportQueue
    ) {
        this.snapshot = {
            device: null,
            imports: importQueue.snapshot(),
            tasks: taskManager.list(),
        };
        taskManager.subscribe(() => this.update({ tasks: taskManager.list() }));
        importQueue.subscribe((imports) => this.update({ imports }));
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

    private update(changes: Partial<WorkspaceSnapshot>) {
        this.snapshot = { ...this.snapshot, ...structuredClone(changes) };
        for (const listener of this.listeners) listener();
    }
}

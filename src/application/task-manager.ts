export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';

export type TaskPhase = 'queued' | 'preparing' | 'converting' | 'transferring' | 'finalizing' | 'complete';

export interface TaskProgress {
    completed: number;
    total: number;
    unit: 'tracks' | 'bytes' | 'steps';
    currentLabel?: string;
    bytesWritten?: number;
    bytesTotal?: number;
}

export interface TaskError {
    code: string;
    message: string;
}

export interface TaskSnapshot<TResult = unknown> {
    id: string;
    kind: string;
    label: string;
    status: TaskStatus;
    phase: TaskPhase;
    progress: TaskProgress;
    cancellationRequested: boolean;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    error?: TaskError;
    result?: TResult;
}

type TaskListener = (task: TaskSnapshot) => void;

function createTaskId() {
    return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneTask<TResult>(task: TaskSnapshot<TResult>): TaskSnapshot<TResult> {
    return structuredClone(task);
}

export class TaskManager {
    private readonly tasks = new Map<string, TaskSnapshot>();
    private readonly listeners = new Set<TaskListener>();

    create(kind: string, label: string, total = 1, unit: TaskProgress['unit'] = 'steps') {
        if (!kind.trim() || !label.trim()) throw new Error('Task kind and label are required.');
        if (!Number.isFinite(total) || total < 0) throw new Error('Task total must be a non-negative number.');
        const task: TaskSnapshot = {
            id: createTaskId(),
            kind,
            label,
            status: 'queued',
            phase: 'queued',
            progress: { completed: 0, total, unit },
            cancellationRequested: false,
            createdAt: new Date().toISOString(),
        };
        this.tasks.set(task.id, task);
        this.emit(task);
        return cloneTask(task);
    }

    start(id: string, phase: Exclude<TaskPhase, 'queued' | 'complete'> = 'preparing') {
        return this.updateActive(id, (task) => {
            task.status = 'running';
            task.phase = phase;
            task.startedAt ??= new Date().toISOString();
        });
    }

    setPhase(id: string, phase: Exclude<TaskPhase, 'queued' | 'complete'>) {
        return this.updateRunning(id, (task) => {
            task.phase = phase;
        });
    }

    reportProgress(id: string, progress: Partial<TaskProgress>) {
        return this.updateRunning(id, (task) => {
            const nextProgress = { ...task.progress, ...progress };
            if (nextProgress.completed < 0 || nextProgress.total < 0 || nextProgress.completed > nextProgress.total) {
                throw new Error('Task progress must stay between zero and its total.');
            }
            task.progress = nextProgress;
        });
    }

    requestCancellation(id: string) {
        return this.updateActive(id, (task) => {
            task.cancellationRequested = true;
        });
    }

    isCancellationRequested(id: string) {
        return this.requireTask(id).cancellationRequested;
    }

    succeed<TResult>(id: string, result?: TResult) {
        return this.finish(id, 'succeeded', (task) => {
            task.result = result;
            task.progress.completed = task.progress.total;
        });
    }

    fail(id: string, error: unknown, code = 'TASK_FAILED') {
        const typed = error as Error;
        return this.finish(id, 'failed', (task) => {
            task.error = { code, message: typed?.message || String(error) };
        });
    }

    cancel(id: string) {
        return this.finish(id, 'cancelled');
    }

    interrupt(id: string, message = 'Task interrupted before completion.') {
        return this.finish(id, 'interrupted', (task) => {
            task.error = { code: 'TASK_INTERRUPTED', message };
        });
    }

    get(id: string) {
        return cloneTask(this.requireTask(id));
    }

    list() {
        return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((task) => cloneTask(task));
    }

    subscribe(listener: TaskListener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private updateActive(id: string, update: (task: TaskSnapshot) => void) {
        const task = this.requireTask(id);
        if (this.isFinished(task)) throw new Error(`Task ${id} is already finished.`);
        update(task);
        this.emit(task);
        return cloneTask(task);
    }

    private updateRunning(id: string, update: (task: TaskSnapshot) => void) {
        const task = this.requireTask(id);
        if (task.status !== 'running') throw new Error(`Task ${id} is not running.`);
        update(task);
        this.emit(task);
        return cloneTask(task);
    }

    private finish(
        id: string,
        status: Extract<TaskStatus, 'succeeded' | 'failed' | 'cancelled' | 'interrupted'>,
        update?: (task: TaskSnapshot) => void
    ) {
        const task = this.requireTask(id);
        if (this.isFinished(task)) throw new Error(`Task ${id} is already finished.`);
        update?.(task);
        task.status = status;
        task.phase = 'complete';
        task.finishedAt = new Date().toISOString();
        this.emit(task);
        return cloneTask(task);
    }

    private requireTask(id: string) {
        const task = this.tasks.get(id);
        if (!task) throw new Error(`Task ${id} does not exist.`);
        return task;
    }

    private isFinished(task: TaskSnapshot) {
        return ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status);
    }

    private emit(task: TaskSnapshot) {
        const snapshot = cloneTask(task);
        for (const listener of this.listeners) listener(snapshot);
    }
}

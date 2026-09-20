import { canRequestTaskCancellation } from './task-cancellation-policy';

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';

export type TaskPhase = 'queued' | 'preparing' | 'converting' | 'transferring' | 'finalizing' | 'complete';

export interface TaskStageProgress {
    completed: number;
    total: number;
    buffered?: number;
    currentLabel?: string;
}

export interface TaskProgress {
    completed: number;
    total: number;
    unit: 'tracks' | 'bytes' | 'steps';
    currentLabel?: string;
    currentPercent?: number;
    bytesWritten?: number;
    bytesTotal?: number;
    stages?: Record<string, TaskStageProgress>;
}

export interface TaskError {
    code: string;
    message: string;
    phase: Exclude<TaskPhase, 'complete'>;
    retryable?: boolean;
    completedItems?: number;
    pendingItems?: number;
    recoveryAction?: string;
    details?: Record<string, unknown>;
}

export interface TaskFailureOptions {
    code?: string;
    retryable?: boolean;
    completedItems?: number;
    pendingItems?: number;
    recoveryAction?: string;
    details?: Record<string, unknown>;
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
            const nextProgress = { ...task.progress, ...structuredClone(progress) };
            if (nextProgress.completed < 0 || nextProgress.total < 0 || nextProgress.completed > nextProgress.total) {
                throw new Error('Task progress must stay between zero and its total.');
            }
            if (
                nextProgress.currentPercent !== undefined &&
                (!Number.isFinite(nextProgress.currentPercent) || nextProgress.currentPercent < 0 || nextProgress.currentPercent > 100)
            ) {
                throw new Error('Current task progress must stay between zero and 100 percent.');
            }
            for (const [name, stage] of Object.entries(nextProgress.stages ?? {})) {
                if (!name.trim()) throw new Error('Task progress stage names must not be empty.');
                if (
                    !Number.isFinite(stage.completed) ||
                    !Number.isFinite(stage.total) ||
                    stage.completed < 0 ||
                    stage.total < 0 ||
                    stage.completed > stage.total
                ) {
                    throw new Error(`Task progress stage ${name} must stay between zero and its total.`);
                }
                if (
                    stage.buffered !== undefined &&
                    (!Number.isFinite(stage.buffered) || stage.buffered < 0 || stage.buffered > stage.total)
                ) {
                    throw new Error(`Task buffered progress stage ${name} must stay between zero and its total.`);
                }
            }
            task.progress = nextProgress;
        });
    }

    requestCancellation(id: string) {
        return this.updateActive(id, (task) => {
            if (!canRequestTaskCancellation(task)) {
                throw new Error(
                    task.kind === 'disc.write'
                        ? 'The active MiniDisc track cannot be interrupted safely and there are no remaining tracks to skip. Keep USB connected until recording finishes.'
                        : 'This task no longer has cancellable work remaining.'
                );
            }
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

    fail(id: string, error: unknown, options: string | TaskFailureOptions = {}) {
        const typed = error as Error & { code?: unknown; details?: unknown };
        const normalized = typeof options === 'string' ? { code: options } : options;
        this.validateItemCount(normalized.completedItems, 'Completed item count');
        this.validateItemCount(normalized.pendingItems, 'Pending item count');
        return this.finish(id, 'failed', (task) => {
            task.error = {
                code: normalized.code ?? (typeof typed?.code === 'string' ? typed.code : 'TASK_FAILED'),
                message: typed?.message || String(error),
                phase: task.phase === 'complete' ? 'finalizing' : task.phase,
                retryable: normalized.retryable,
                completedItems: normalized.completedItems,
                pendingItems: normalized.pendingItems,
                recoveryAction: normalized.recoveryAction,
                details:
                    normalized.details ??
                    (typed?.details && typeof typed.details === 'object' ? (typed.details as Record<string, unknown>) : undefined),
            };
        });
    }

    cancel<TResult>(id: string, result?: TResult) {
        return this.finish(id, 'cancelled', (task) => {
            task.result = result;
        });
    }

    interrupt(id: string, message = 'Task interrupted before completion.') {
        return this.finish(id, 'interrupted', (task) => {
            task.error = {
                code: 'TASK_INTERRUPTED',
                message,
                phase: task.phase === 'complete' ? 'finalizing' : task.phase,
                recoveryAction: 'Reconnect the device, refresh its state, and verify what completed before retrying.',
            };
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
        return () => {
            this.listeners.delete(listener);
        };
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

    private validateItemCount(value: number | undefined, label: string) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
            throw new Error(`${label} must be a non-negative whole number.`);
        }
    }

    private emit(task: TaskSnapshot) {
        const snapshot = cloneTask(task);
        for (const listener of this.listeners) listener(snapshot);
    }
}

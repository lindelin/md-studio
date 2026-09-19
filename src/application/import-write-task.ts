import type { TaskManager } from './task-manager';

export interface ImportWriteRejection {
    kind: 'cancelled' | 'unavailable';
    reason: string;
    pendingItems: number;
    recoveryAction?: string;
}

export function finishRejectedImportWrite(tasks: TaskManager, taskId: string | undefined, rejection: ImportWriteRejection) {
    if (!taskId) return false;
    const task = tasks.get(taskId);
    if (task.status !== 'queued' && task.status !== 'running') return false;

    if (rejection.kind === 'cancelled') {
        tasks.cancel(taskId, { writtenTracks: 0, reason: rejection.reason });
    } else {
        const error = Object.assign(new Error(rejection.reason), { code: 'WRITE_UNAVAILABLE' });
        tasks.fail(taskId, error, {
            completedItems: 0,
            pendingItems: rejection.pendingItems,
            recoveryAction: rejection.recoveryAction,
        });
    }
    return true;
}

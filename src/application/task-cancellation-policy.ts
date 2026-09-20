export interface TaskCancellationCandidate {
    kind: string;
    status: string;
    phase: string;
    progress: { completed: number; total: number };
}

export function isActiveUninterruptibleWrite(task: TaskCancellationCandidate) {
    return task.kind === 'disc.write' && task.status === 'running' && task.phase === 'transferring';
}

export function canRequestTaskCancellation(task: TaskCancellationCandidate) {
    if (task.status !== 'running' && task.status !== 'queued') return false;
    if (task.progress.completed >= task.progress.total) return false;
    if (task.kind === 'disc.write' && task.phase === 'finalizing') return false;
    return !(isActiveUninterruptibleWrite(task) && task.progress.completed + 1 >= task.progress.total);
}

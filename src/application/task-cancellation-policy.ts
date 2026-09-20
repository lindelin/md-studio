export interface TaskCancellationCandidate {
    kind: string;
    status: string;
    phase: string;
    progress: { completed: number; total: number };
    cancellationRequested?: boolean;
}

export interface TaskCancellationPresentation {
    actionLabel: string;
    safetyNotice?: string;
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

export function getTaskCancellationPresentation(task: TaskCancellationCandidate): TaskCancellationPresentation {
    if (task.kind !== 'disc.write') {
        return { actionLabel: task.cancellationRequested ? 'Cancellation requested' : 'Cancel task' };
    }
    if (!isActiveUninterruptibleWrite(task)) {
        return {
            actionLabel: task.cancellationRequested ? 'Cancellation requested' : 'Cancel before recording starts',
        };
    }

    if (task.cancellationRequested) {
        return {
            actionLabel: 'Ending batch after current track',
            safetyNotice:
                'The batch will end after this track. The track already recording will continue; keep USB connected until the recording light stops.',
        };
    }
    if (task.progress.completed + 1 >= task.progress.total) {
        return {
            actionLabel: 'Current track cannot be stopped',
            safetyNotice:
                'This is the final track and it cannot be interrupted safely. Keep USB connected until the recording light stops.',
        };
    }
    return {
        actionLabel: 'End batch after current track',
        safetyNotice:
            'The track already recording cannot be interrupted safely. Ending the batch only prevents later tracks from starting; keep USB connected while the recording light is flashing.',
    };
}

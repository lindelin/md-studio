import type { WorkspaceSnapshot } from '../application/workspace-store';

export function hasPendingWorkspaceWork(workspace: WorkspaceSnapshot) {
    return (
        workspace.tasks.some((task) => task.status === 'queued' || task.status === 'running') ||
        workspace.device?.status.canBeFlushed === true
    );
}

import type { WorkspaceSnapshot } from '../application/workspace-store';

export interface LegacyOperationState {
    factoryProgressVisible: boolean;
    recordVisible: boolean;
}

export function hasPendingWorkspaceWork(workspace: WorkspaceSnapshot, legacy: LegacyOperationState) {
    return (
        workspace.tasks.some((task) => task.status === 'queued' || task.status === 'running') ||
        workspace.device?.status.canBeFlushed === true ||
        legacy.factoryProgressVisible ||
        legacy.recordVisible
    );
}

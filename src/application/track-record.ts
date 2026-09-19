import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskSnapshot } from './task-manager';

export interface TrackRecordRequest {
    indexes: number[];
    deviceId: string;
    expectedRevision?: number;
}

export interface TrackRecorder {
    start(request: TrackRecordRequest, application: MiniDiscApplication, tasks: TaskManager): Promise<TaskSnapshot>;
}

import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskSnapshot } from './task-manager';

export interface TrackExportRequest {
    indexes: number[];
    convertToWav?: boolean;
    outputHandle?: string;
    expectedRevision?: number;
}

export type TrackExportSink = (data: Uint8Array, fileName: string) => void | Promise<void>;

export interface TrackExporter {
    start(
        request: TrackExportRequest,
        application: MiniDiscApplication,
        tasks: TaskManager,
        sink?: TrackExportSink
    ): Promise<TaskSnapshot>;
}

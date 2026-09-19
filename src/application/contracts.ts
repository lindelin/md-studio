import type { Disc, DeviceStatus } from '../services/interfaces/netmd';

export type ApplicationCapability =
    | 'content.read'
    | 'playback.control'
    | 'metadata.edit'
    | 'track.upload'
    | 'track.download'
    | 'disc.eject'
    | 'advanced.factory'
    | 'metadata.himd'
    | 'metadata.fullWidth'
    | 'track.uploadMono'
    | 'disc.formatHimd';

export interface DeviceSnapshot {
    sessionId: string;
    revision: number;
    deviceName: string;
    status: DeviceStatus;
    capabilities: ApplicationCapability[];
    disc: Disc | null;
}

export interface TrackMetadataUpdate {
    index: number;
    title: string;
    fullWidthTitle?: string;
}

export interface DeviceGateway {
    readSnapshot(dropCache?: boolean): Promise<Omit<DeviceSnapshot, 'sessionId' | 'revision'>>;
    renameDisc(title: string, fullWidthTitle?: string): Promise<void>;
    renameTrack(update: TrackMetadataUpdate): Promise<void>;
    moveTrack(sourceIndex: number, destinationIndex: number): Promise<void>;
}

export class ApplicationError extends Error {
    public readonly code: 'NO_DISC' | 'CAPABILITY_REQUIRED' | 'STALE_REVISION' | 'INVALID_INPUT';
    public readonly details?: Record<string, unknown>;

    constructor(
        code: 'NO_DISC' | 'CAPABILITY_REQUIRED' | 'STALE_REVISION' | 'INVALID_INPUT',
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ApplicationError';
        this.code = code;
        this.details = details;
    }
}

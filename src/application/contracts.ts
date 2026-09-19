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

export interface GroupMetadataUpdate {
    index: number;
    title: string;
    fullWidthTitle?: string;
}

export interface DestructiveConfirmation {
    confirmed: true;
    reason: string;
}

export type PlaybackCommand =
    | { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' }
    | { action: 'gotoTrack'; index: number }
    | { action: 'seek'; index: number; hour: number; minute: number; second: number; frame: number };

export interface DeviceGateway {
    readSnapshot(dropCache?: boolean): Promise<Omit<DeviceSnapshot, 'sessionId' | 'revision'>>;
    renameDisc(title: string, fullWidthTitle?: string): Promise<void>;
    renameTrack(update: TrackMetadataUpdate): Promise<void>;
    renameGroup(update: GroupMetadataUpdate): Promise<void>;
    addGroup(firstTrack: number, trackCount: number, title: string, fullWidthTitle?: string): Promise<void>;
    deleteGroup(index: number): Promise<void>;
    deleteTracks(indexes: number[]): Promise<void>;
    moveTrack(sourceIndex: number, destinationIndex: number): Promise<void>;
    wipeDisc(): Promise<void>;
    ejectDisc(): Promise<void>;
    controlPlayback(command: PlaybackCommand): Promise<void>;
}

export class ApplicationError extends Error {
    public readonly code:
        | 'NO_DISC'
        | 'CAPABILITY_REQUIRED'
        | 'STALE_REVISION'
        | 'INVALID_INPUT'
        | 'CONFIRMATION_REQUIRED'
        | 'DISC_READ_ONLY';
    public readonly details?: Record<string, unknown>;

    constructor(
        code: 'NO_DISC' | 'CAPABILITY_REQUIRED' | 'STALE_REVISION' | 'INVALID_INPUT' | 'CONFIRMATION_REQUIRED' | 'DISC_READ_ONLY',
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ApplicationError';
        this.code = code;
        this.details = details;
    }
}

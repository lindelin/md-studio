import type { Disc, DeviceStatus, Group } from '../services/interfaces/netmd';

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

export interface HiMDTrackMetadataUpdate {
    index: number;
    title?: string;
    album?: string;
    artist?: string;
}

export interface DestructiveConfirmation {
    confirmed: true;
    reason: string;
}

export interface AdvancedDeviceInfo {
    firmwareVersion: string;
    capabilities: string[];
}

export interface AdvancedTocDump {
    sectorSize: number;
    sectorCount: number;
    byteLength: number;
    sha256: string;
    dataBase64: string;
}

export interface DiagnosticProgress {
    completed: number;
    total: number;
    currentLabel: string;
}

export interface SelfTestResult {
    completedSteps: number;
    totalSteps: number;
    cancelled: boolean;
}

export interface AdvancedDeviceGateway {
    readInfo(): Promise<AdvancedDeviceInfo>;
    readTocSector(index: number): Promise<Uint8Array>;
}

export type PlaybackCommand =
    | { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' }
    | { action: 'gotoTrack'; index: number }
    | { action: 'seek'; index: number; hour: number; minute: number; second: number; frame: number };

export interface DeviceGateway {
    readSnapshot(dropCache?: boolean): Promise<Omit<DeviceSnapshot, 'sessionId' | 'revision'>>;
    renameDisc(title: string, fullWidthTitle?: string): Promise<void>;
    renameTrack(update: TrackMetadataUpdate): Promise<void>;
    renameHiMDTrack(update: HiMDTrackMetadataUpdate): Promise<void>;
    renameGroup(update: GroupMetadataUpdate): Promise<void>;
    addGroup(firstTrack: number, trackCount: number, title: string, fullWidthTitle?: string): Promise<void>;
    deleteGroup(index: number): Promise<void>;
    deleteTracks(indexes: number[]): Promise<void>;
    rewriteGroups(groups: Group[]): Promise<void>;
    moveTrack(sourceIndex: number, destinationIndex: number): Promise<void>;
    wipeDisc(): Promise<void>;
    formatToHiMD(): Promise<void>;
    flush(): Promise<void>;
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
        | 'DISC_READ_ONLY'
        | 'DEVICE_NOT_CONNECTED';
    public readonly details?: Record<string, unknown>;

    constructor(
        code:
            | 'NO_DISC'
            | 'CAPABILITY_REQUIRED'
            | 'STALE_REVISION'
            | 'INVALID_INPUT'
            | 'CONFIRMATION_REQUIRED'
            | 'DISC_READ_ONLY'
            | 'DEVICE_NOT_CONNECTED',
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ApplicationError';
        this.code = code;
        this.details = details;
    }
}

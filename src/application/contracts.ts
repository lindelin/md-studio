import type { Codec, Disc, DeviceStatus, Group, RecordingCodec, TitleParameter } from '../services/interfaces/netmd';
import type { ImportPreviewCalculation, ImportPreviewTrack } from './import-preview';

export type ApplicationCapability =
    | 'content.read'
    | 'playback.control'
    | 'metadata.edit'
    | 'disc.rename'
    | 'track.rename'
    | 'group.rename'
    | 'group.create'
    | 'group.delete'
    | 'track.delete'
    | 'track.move'
    | 'disc.erase'
    | 'track.upload'
    | 'track.download'
    | 'disc.eject'
    | 'advanced.factory'
    | 'metadata.himd'
    | 'metadata.fullWidth'
    | 'track.uploadMono'
    | 'disc.formatHimd';

export interface DeviceRecordingFormat extends RecordingCodec {
    secondsPerDefaultUnit?: number;
}

export interface DeviceRecordingProfile {
    specName: string;
    measurementUnits: 'bytes' | 'frames';
    titleStorage: 'netmd-toc' | 'unicode';
    defaultFormat: [number, number];
    availableFormats: DeviceRecordingFormat[];
}

export interface DeviceSnapshot {
    sessionId: string;
    revision: number;
    deviceName: string;
    status: DeviceStatus;
    capabilities: ApplicationCapability[];
    recording: DeviceRecordingProfile;
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

export type AdvancedMemoryKind = 'ram' | 'firmware';
export type AdvancedMemoryRegion = 'RAM' | 'ROM' | 'DRAM';

export interface AdvancedMemoryProgress {
    region: AdvancedMemoryRegion;
    readBytes: number;
    totalBytes: number;
}

export interface AdvancedMemoryDump {
    ram: Uint8Array;
    rom?: Uint8Array;
    dram?: Uint8Array;
}

export type AdvancedBadSectorDecision = 'reload' | 'abort' | 'skip' | 'yieldanyway';

export interface AdvancedTrackReadProgress {
    read: number;
    total: number;
    action: 'READ' | 'SEEK' | 'CHUNK';
    sector?: string;
}

export interface AdvancedTrackReadOptions {
    nerawDownload: boolean;
    shouldCancel: () => boolean;
    handleBadSector: (address: string, count: number, seconds: number) => Promise<AdvancedBadSectorDecision>;
    startSeconds?: number;
    secondsToRead?: number;
    writeHeader?: boolean;
}

export interface AdvancedTrackData {
    data: Uint8Array;
    extension: string;
}

export type AdvancedTrackReader = (
    index: number,
    options: AdvancedTrackReadOptions,
    onProgress: (progress: AdvancedTrackReadProgress) => void
) => Promise<AdvancedTrackData>;

export interface AdvancedUploadService {
    uploadSP(
        title: string,
        fullWidthTitle: string,
        mono: boolean,
        data: ArrayBuffer,
        onProgress: (progress: { written: number; encrypted: number; total: number }) => void
    ): Promise<number>;
    enableMonoUpload(enabled: boolean): Promise<void>;
}

export interface DeviceUploadService {
    prepareUpload(): Promise<void>;
    finalizeUpload(): Promise<void>;
    upload(
        title: TitleParameter,
        fullWidthTitle: string,
        data: ArrayBuffer,
        format: Codec,
        onProgress: (progress: { written: number; encrypted: number; total: number }) => void
    ): Promise<void>;
    getRemainingCharactersForTitles(disc: Disc): { halfWidth: number; fullWidth: number };
    sanitizeHalfWidthTitle(title: string): string;
    sanitizeFullWidthTitle(title: string): string;
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
    writeTocSector(index: number, data: Uint8Array): Promise<void>;
    flushToc(): Promise<void>;
    runTetris(): Promise<void>;
    setSpUploadSpeedup(enabled: boolean): Promise<void>;
    setDiscSwapDetectionDisabled(disabled: boolean): Promise<void>;
    enableHimdFullMode(): Promise<void>;
    enterServiceMode(): Promise<void>;
    readRam(onProgress: (progress: AdvancedMemoryProgress) => void): Promise<Uint8Array>;
    readFirmware(onProgress: (progress: AdvancedMemoryProgress) => void): Promise<AdvancedMemoryDump>;
    prepareTrackDownload(useSlowerExploit: boolean): Promise<void>;
    readTrack(
        index: number,
        options: AdvancedTrackReadOptions,
        onProgress: (progress: AdvancedTrackReadProgress) => void
    ): Promise<AdvancedTrackData>;
    finalizeTrackDownload(): Promise<void>;
    uploadSP: AdvancedUploadService['uploadSP'];
    enableMonoUpload(enabled: boolean): Promise<void>;
}

export type PlaybackCommand =
    | { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' }
    | { action: 'gotoTrack'; index: number }
    | { action: 'seek'; index: number; hour: number; minute: number; second: number; frame: number };

export interface PlaybackSession {
    control(command: PlaybackCommand): Promise<void>;
    readPosition(): Promise<number[] | null>;
}

export interface DeviceGateway extends DeviceUploadService {
    readSnapshot(dropCache?: boolean): Promise<Omit<DeviceSnapshot, 'sessionId' | 'revision'>>;
    readStatus(): Promise<DeviceStatus>;
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
    readPlaybackPosition(): Promise<number[] | null>;
    downloadTrack(
        index: number,
        onProgress: (progress: { read: number; total: number }) => void
    ): Promise<{ extension: string; data: Uint8Array<ArrayBuffer> } | null>;
    previewImports(disc: Disc, tracks: ImportPreviewTrack[], format: { codec: string; bitrate: number }): ImportPreviewCalculation;
}

export class ApplicationError extends Error {
    public readonly code:
        | 'NO_DISC'
        | 'CAPABILITY_REQUIRED'
        | 'STALE_REVISION'
        | 'INVALID_INPUT'
        | 'CONFIRMATION_REQUIRED'
        | 'INTERACTIVE_AUTHORIZATION_REQUIRED'
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
            | 'INTERACTIVE_AUTHORIZATION_REQUIRED'
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

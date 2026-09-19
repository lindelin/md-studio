import type {
    AdvancedDeviceGateway,
    DeviceGateway,
    ApplicationCapability,
    GroupMetadataUpdate,
    HiMDTrackMetadataUpdate,
    PlaybackCommand,
    AdvancedMemoryProgress,
    AdvancedTrackReadOptions,
    AdvancedTrackReadProgress,
} from './contracts';
import {
    Capability,
    ExploitCapability,
    type Group,
    type MinidiscSpec,
    type NetMDFactoryService,
    type NetMDService,
} from '../services/interfaces/netmd';
import { createDeviceRecordingProfile } from './device-profile';
import { calculateImportPreview } from './import-preview';

const capabilityNames: Record<Capability, ApplicationCapability> = {
    [Capability.contentList]: 'content.read',
    [Capability.playbackControl]: 'playback.control',
    [Capability.metadataEdit]: 'metadata.edit',
    [Capability.trackUpload]: 'track.upload',
    [Capability.trackDownload]: 'track.download',
    [Capability.discEject]: 'disc.eject',
    [Capability.factoryMode]: 'advanced.factory',
    [Capability.himdTitles]: 'metadata.himd',
    [Capability.fullWidthSupport]: 'metadata.fullWidth',
    [Capability.nativeMonoUpload]: 'track.uploadMono',
    [Capability.himdFormat]: 'disc.formatHimd',
};

export class NetMDDeviceGateway implements DeviceGateway {
    constructor(
        private readonly service: NetMDService,
        private readonly spec: MinidiscSpec
    ) {}

    async readSnapshot(dropCache = false) {
        const status = await this.service.getDeviceStatus();
        const deviceName = await this.service.getDeviceName();
        const capabilities = (await this.service.getServiceCapabilities()).map((capability) => capabilityNames[capability]);
        const disc = status.discPresent ? await this.service.listContent(dropCache) : null;
        return { deviceName, status, capabilities, recording: createDeviceRecordingProfile(this.spec), disc };
    }

    readStatus() {
        return this.service.getDeviceStatus();
    }

    async renameDisc(title: string, fullWidthTitle?: string) {
        await this.service.renameDisc(this.spec.sanitizeHalfWidthTitle(title), this.sanitizeFullWidthTitle(fullWidthTitle));
    }

    async renameTrack({ index, title, fullWidthTitle }: Parameters<DeviceGateway['renameTrack']>[0]) {
        await this.service.renameTrack(index, this.spec.sanitizeHalfWidthTitle(title), this.sanitizeFullWidthTitle(fullWidthTitle));
    }

    async renameHiMDTrack({ index, title, album, artist }: HiMDTrackMetadataUpdate) {
        await this.service.renameTrack(index, { title, album, artist });
    }

    async renameGroup({ index, title, fullWidthTitle }: GroupMetadataUpdate) {
        await this.service.renameGroup(index, this.spec.sanitizeHalfWidthTitle(title), this.sanitizeFullWidthTitle(fullWidthTitle));
    }

    async addGroup(firstTrack: number, trackCount: number, title: string, fullWidthTitle?: string) {
        await this.service.addGroup(
            firstTrack,
            trackCount,
            this.spec.sanitizeHalfWidthTitle(title),
            this.sanitizeFullWidthTitle(fullWidthTitle)
        );
    }

    async deleteGroup(index: number) {
        await this.service.deleteGroup(index);
    }

    async deleteTracks(indexes: number[]) {
        await this.service.deleteTracks(indexes);
    }

    async rewriteGroups(groups: Group[]) {
        await this.service.rewriteGroups(
            groups.map((group) => ({
                ...group,
                title: group.title === null ? null : this.spec.sanitizeHalfWidthTitle(group.title),
                fullWidthTitle:
                    group.fullWidthTitle === null ? null : this.spec.sanitizeFullWidthTitle(group.fullWidthTitle),
                tracks: group.tracks.map((track) => ({
                    ...track,
                    title: this.spec.sanitizeHalfWidthTitle(track.title ?? ''),
                    fullWidthTitle: this.spec.sanitizeFullWidthTitle(track.fullWidthTitle ?? ''),
                })),
            }))
        );
    }

    async moveTrack(sourceIndex: number, destinationIndex: number) {
        // NetMD and Hi-MD historically disagree about what an omitted third
        // argument means. Application-level moves always preserve group
        // membership, so make that contract explicit at the adapter boundary.
        await this.service.moveTrack(sourceIndex, destinationIndex, true);
    }

    async wipeDisc() {
        await this.service.wipeDisc();
    }

    async formatToHiMD() {
        await this.service.formatToHiMD();
    }

    async flush() {
        await this.service.flush();
    }

    async ejectDisc() {
        await this.service.ejectDisc();
    }

    async controlPlayback(command: PlaybackCommand) {
        switch (command.action) {
            case 'play':
                return this.service.play();
            case 'pause':
                return this.service.pause();
            case 'stop':
                return this.service.stop();
            case 'next':
                return this.service.next();
            case 'previous':
                return this.service.prev();
            case 'gotoTrack':
                return this.service.gotoTrack(command.index);
            case 'seek':
                return this.service.gotoTime(command.index, command.hour, command.minute, command.second, command.frame);
        }
    }

    previewImports(
        disc: Parameters<DeviceGateway['previewImports']>[0],
        tracks: Parameters<DeviceGateway['previewImports']>[1],
        format: Parameters<DeviceGateway['previewImports']>[2]
    ) {
        return calculateImportPreview(this.spec, disc, tracks, format);
    }

    private sanitizeFullWidthTitle(title?: string) {
        return title === undefined ? undefined : this.spec.sanitizeFullWidthTitle(title);
    }
}

export class NetMDAdvancedDeviceGateway implements AdvancedDeviceGateway {
    private factoryService?: NetMDFactoryService;

    constructor(
        private readonly service: NetMDService,
        existingFactoryService?: NetMDFactoryService,
        private readonly onInitialize?: (factoryService: NetMDFactoryService) => void
    ) {
        this.factoryService = existingFactoryService;
    }

    async readInfo() {
        const factory = await this.getFactoryService();
        return {
            firmwareVersion: await factory.getDeviceFirmware(),
            capabilities: (await factory.getExploitCapabilities()).map((capability) => ExploitCapability[capability]),
        };
    }

    async readTocSector(index: number) {
        return this.getFactoryService().then((factory) => factory.readUTOCSector(index));
    }

    async writeTocSector(index: number, data: Uint8Array) {
        const factory = await this.getFactoryService();
        await factory.writeUTOCSector(index, data);
    }

    async flushToc() {
        const factory = await this.getFactoryService();
        await factory.flushUTOCCacheToDisc();
    }

    async runTetris() {
        const factory = await this.getFactoryService();
        await factory.runTetris();
    }

    async setSpUploadSpeedup(enabled: boolean) {
        const factory = await this.getFactoryService();
        await factory.setSPSpeedupActive(enabled);
    }

    async setDiscSwapDetectionDisabled(disabled: boolean) {
        const factory = await this.getFactoryService();
        await factory.setDiscSwapDetection(disabled);
    }

    async enableHimdFullMode() {
        const factory = await this.getFactoryService();
        await factory.enableHiMDFullMode();
    }

    async enterServiceMode() {
        const factory = await this.getFactoryService();
        await factory.enterServiceMode();
    }

    async readRam(onProgress: (progress: AdvancedMemoryProgress) => void) {
        const factory = await this.getFactoryService();
        return factory.readRAM(({ readBytes, totalBytes }) => onProgress({ region: 'RAM', readBytes, totalBytes }));
    }

    async readFirmware(onProgress: (progress: AdvancedMemoryProgress) => void) {
        const factory = await this.getFactoryService();
        return factory.readFirmware(({ type, readBytes, totalBytes }) =>
            onProgress({ region: type, readBytes, totalBytes })
        );
    }

    async prepareTrackDownload(useSlowerExploit: boolean) {
        const factory = await this.getFactoryService();
        await factory.prepareDownload(useSlowerExploit);
    }

    async readTrack(
        index: number,
        options: AdvancedTrackReadOptions,
        onProgress: (progress: AdvancedTrackReadProgress) => void
    ) {
        const factory = await this.getFactoryService();
        return factory.exploitDownloadTrack(index, options.nerawDownload, onProgress, {
            shouldCancelImmediately: options.shouldCancel,
            handleBadSector: options.handleBadSector,
            startSeconds: options.startSeconds,
            secondsToRead: options.secondsToRead,
            writeHeader: options.writeHeader,
        });
    }

    async finalizeTrackDownload() {
        const factory = await this.getFactoryService();
        await factory.finalizeDownload();
    }

    async uploadSP(
        title: string,
        fullWidthTitle: string,
        mono: boolean,
        data: ArrayBuffer,
        onProgress: (progress: { written: number; encrypted: number; total: number }) => void
    ) {
        const factory = await this.getFactoryService();
        return factory.uploadSP(title, fullWidthTitle, mono, data, onProgress);
    }

    async enableMonoUpload(enabled: boolean) {
        const factory = await this.getFactoryService();
        await factory.enableMonoUpload(enabled);
    }

    private async getFactoryService() {
        if (this.factoryService) return this.factoryService;
        const factory = await this.service.factory();
        if (!factory) throw new Error('The connected device did not provide an advanced maintenance session.');
        this.factoryService = factory;
        this.onInitialize?.(factory);
        return factory;
    }
}

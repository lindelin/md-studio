import type { DeviceGateway, ApplicationCapability } from './contracts';
import { Capability, type MinidiscSpec, type NetMDService } from '../services/interfaces/netmd';

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
        return { deviceName, status, capabilities, disc };
    }

    async renameDisc(title: string, fullWidthTitle?: string) {
        await this.service.renameDisc(this.spec.sanitizeHalfWidthTitle(title), this.sanitizeFullWidthTitle(fullWidthTitle));
    }

    async renameTrack({ index, title, fullWidthTitle }: Parameters<DeviceGateway['renameTrack']>[0]) {
        await this.service.renameTrack(index, this.spec.sanitizeHalfWidthTitle(title), this.sanitizeFullWidthTitle(fullWidthTitle));
    }

    async moveTrack(sourceIndex: number, destinationIndex: number) {
        await this.service.moveTrack(sourceIndex, destinationIndex);
    }

    private sanitizeFullWidthTitle(title?: string) {
        return title === undefined ? undefined : this.spec.sanitizeFullWidthTitle(title);
    }
}

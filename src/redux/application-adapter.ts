import type { AppDispatch } from './store';
import type { DeviceSnapshot } from '../application/contracts';
import { Capability } from '../services/interfaces/capabilities';
import { batchActions } from '../frontend-utils';
import { actions as mainActions } from './main-feature';

export function applyDeviceSnapshot(dispatch: AppDispatch, snapshot: DeviceSnapshot | null) {
    dispatch(
        batchActions([
            mainActions.setDisc(snapshot?.disc ?? null),
            mainActions.setDeviceName(snapshot?.deviceName ?? ''),
            mainActions.setDeviceStatus(snapshot?.status ?? null),
            mainActions.setDeviceCapabilities(toLegacyCapabilities(snapshot)),
        ])
    );
}

function toLegacyCapabilities(snapshot: DeviceSnapshot | null) {
    if (!snapshot) return [Capability.contentList];
    return snapshot.capabilities
        .map(
            (capability) =>
                ({
                    'content.read': Capability.contentList,
                    'playback.control': Capability.playbackControl,
                    'metadata.edit': Capability.metadataEdit,
                    'track.upload': Capability.trackUpload,
                    'track.download': Capability.trackDownload,
                    'disc.eject': Capability.discEject,
                    'advanced.factory': Capability.factoryMode,
                    'metadata.himd': Capability.himdTitles,
                    'metadata.fullWidth': Capability.fullWidthSupport,
                    'track.uploadMono': Capability.nativeMonoUpload,
                    'disc.formatHimd': Capability.himdFormat,
                })[capability]
        )
        .filter((capability) => capability !== undefined) as Capability[];
}

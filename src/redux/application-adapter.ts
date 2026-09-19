import type { AppDispatch } from './store';
import type { DeviceSnapshot } from '../application/contracts';
import { Capability } from '../services/interfaces/netmd';
import { batchActions } from '../frontend-utils';
import { actions as mainActions } from './main-feature';

export function applyDeviceSnapshot(dispatch: AppDispatch, snapshot: DeviceSnapshot) {
    dispatch(
        batchActions([
            mainActions.setDisc(snapshot.disc),
            mainActions.setDeviceName(snapshot.deviceName),
            mainActions.setDeviceStatus(snapshot.status),
            mainActions.setDeviceCapabilities(
                snapshot.capabilities
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
                    .filter((capability) => capability !== undefined) as Capability[]
            ),
        ])
    );
}

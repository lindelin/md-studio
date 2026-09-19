import type { ApplicationClient } from '../application/application-client';
import type { DeviceSnapshot } from '../application/contracts';

type DeviceWorkspaceSource = Pick<ApplicationClient, 'getWorkspaceSnapshot' | 'subscribe'>;

export function subscribeLegacyDeviceProjection(
    source: DeviceWorkspaceSource,
    project: (snapshot: DeviceSnapshot | null) => void
) {
    let previous: DeviceSnapshot | null | undefined;
    const synchronize = () => {
        const current = source.getWorkspaceSnapshot().device;
        if (current === previous) return;
        previous = current;
        project(current);
    };

    synchronize();
    return source.subscribe(synchronize);
}

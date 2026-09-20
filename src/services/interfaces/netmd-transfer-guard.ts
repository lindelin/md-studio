import type { NetMDInterface } from 'netmd-js';

export class NetMDTransferTerminationError extends Error {
    constructor(
        readonly transferError: unknown,
        readonly terminationError: unknown
    ) {
        super(
            'The NetMD transfer failed and the recorder did not acknowledge the protocol cleanup command. If the recording light is still flashing, reconnect the USB cable before trying again.',
            { cause: transferError }
        );
        this.name = 'NetMDTransferTerminationError';
    }
}

/**
 * NetMD secure send command 0x28 leaves the recorder waiting for more bulk
 * data when packet generation, USB transfer, or reply parsing fails. netmd-js
 * exposes command 0x2A as terminate and historically used it to close a
 * prepared 0x28 transaction before retrying. This guard applies that known
 * failure cleanup without changing the user-visible cancellation boundary.
 */
export function createNetMDTransferGuard(netmd: NetMDInterface): NetMDInterface {
    const sendTrack = netmd.sendTrack.bind(netmd);
    const terminate = netmd.terminate.bind(netmd);
    const guardedSendTrack: NetMDInterface['sendTrack'] = async (...args: Parameters<NetMDInterface['sendTrack']>) => {
        try {
            return await sendTrack(...args);
        } catch (transferError) {
            try {
                await terminate();
            } catch (terminationError) {
                throw new NetMDTransferTerminationError(transferError, terminationError);
            }
            throw transferError;
        }
    };

    return new Proxy(netmd, {
        get(target, property) {
            if (property === 'sendTrack') return guardedSendTrack;
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

import type { DeviceRecordingProfile } from './contracts';
import type { Codec, MinidiscSpec } from '../services/interfaces/netmd';
import {
    sanitizeFullWidthTitle as sanitizeNetMDFullWidthTitle,
    sanitizeHalfWidthTitle as sanitizeNetMDHalfWidthTitle,
} from 'netmd-js/dist/utils';

export function createDeviceRecordingProfile(spec: MinidiscSpec): DeviceRecordingProfile {
    return {
        specName: spec.specName,
        measurementUnits: spec.measurementUnits,
        titleStorage: spec.titleStorage,
        defaultFormat: [...spec.defaultFormat],
        availableFormats: spec.availableFormats.map((format) => ({
            ...format,
            availableBitrates: [...format.availableBitrates],
            ...(spec.measurementUnits === 'frames'
                ? {
                      secondsPerDefaultUnit: spec.translateDefaultMeasuringModeTo(
                          { codec: format.codec, bitrate: format.defaultBitrate },
                          1
                      ),
                  }
                : {}),
        })),
    };
}

export function getRecordingCodec(profile: DeviceRecordingProfile, index: [number, number]): Codec | null {
    const format = profile.availableFormats[index[0]];
    const bitrate = format?.availableBitrates[index[1]];
    return format && bitrate !== undefined ? { codec: format.codec, bitrate } : null;
}

export function getDefaultRecordingFormat(profile: DeviceRecordingProfile) {
    return profile.availableFormats[profile.defaultFormat[0]] ?? null;
}

export function sanitizeDeviceHalfWidthTitle(profile: DeviceRecordingProfile | undefined, title: string) {
    return profile?.titleStorage === 'netmd-toc' ? sanitizeNetMDHalfWidthTitle(title) : title;
}

export function sanitizeDeviceFullWidthTitle(profile: DeviceRecordingProfile | undefined, title: string) {
    return profile?.titleStorage === 'netmd-toc' ? sanitizeNetMDFullWidthTitle(title) : title;
}

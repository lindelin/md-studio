import type { DeviceRecordingProfile } from './contracts';
import {
    sanitizeFullWidthTitle as sanitizeNetMDFullWidthTitle,
    sanitizeHalfWidthTitle as sanitizeNetMDHalfWidthTitle,
} from 'netmd-js/dist/utils';

export function sanitizeDeviceHalfWidthTitle(profile: DeviceRecordingProfile | undefined, title: string) {
    return profile?.titleStorage === 'netmd-toc' ? sanitizeNetMDHalfWidthTitle(title) : title;
}

export function sanitizeDeviceFullWidthTitle(profile: DeviceRecordingProfile | undefined, title: string) {
    return profile?.titleStorage === 'netmd-toc' ? sanitizeNetMDFullWidthTitle(title) : title;
}

import { DevicesIds as netmdDevices } from 'netmd-js/dist/netmd';
import { DevicesIds as himdDevices } from 'himd-js/dist/himd';
export function isSupportedMD(device: {vendorId:number;productId:number}) {
    return [...netmdDevices,...himdDevices].some(item => item.vendorId === device.vendorId && item.deviceId === device.productId);
}
// Electron applies this per session, not per device. Both permission and picker
// must therefore enforce isSupportedMD before any device can reach this renderer.
export function protectedMDClasses(classes: readonly string[]) {
    return classes.filter(value => value !== 'audio' && value !== 'mass-storage');
}

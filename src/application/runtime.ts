import serviceRegistry from '../services/registry';
import { ApplicationCommandBus } from './command-bus';
import { NetMDDeviceGateway } from './device-gateway';
import { MiniDiscApplication } from './minidisc-application';

export function bindApplicationRuntime() {
    if (!serviceRegistry.netmdService || !serviceRegistry.netmdSpec) {
        throw new Error('Cannot bind the application runtime before a device and MiniDisc specification are selected.');
    }
    const application = new MiniDiscApplication(new NetMDDeviceGateway(serviceRegistry.netmdService, serviceRegistry.netmdSpec));
    serviceRegistry.application = application;
    serviceRegistry.commandBus = new ApplicationCommandBus(application);
    return application;
}

export function getApplicationRuntime() {
    return serviceRegistry.application ?? bindApplicationRuntime();
}

export function clearApplicationRuntime() {
    serviceRegistry.application = undefined;
    serviceRegistry.commandBus = undefined;
}

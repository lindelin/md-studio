export type AdvancedMaintenanceActionId =
    | 'sp-speedup'
    | 'disc-swap'
    | 'himd-full'
    | 'service-mode';

export interface AdvancedMaintenanceAction {
    id: AdvancedMaintenanceActionId;
    capability: string;
    label: string;
    description: string;
    confirmationToken?: string;
    endsSession: boolean;
}

export const advancedMaintenanceActions: AdvancedMaintenanceAction[] = [
    {
        id: 'sp-speedup',
        capability: 'spUploadSpeedup',
        label: 'SP upload speedup',
        description: 'Apply or remove the experimental SP transfer speed patch for this device session.',
        endsSession: false,
    },
    {
        id: 'disc-swap',
        capability: 'disableDiscSwapDetection',
        label: 'Disc-swap detection',
        description: 'Temporarily disable or restore the device check that notices a changed disc.',
        endsSession: false,
    },
    {
        id: 'himd-full',
        capability: 'himdFullMode',
        label: 'Enable Hi-MD unrestricted mode',
        description: 'Change the device operating mode, disconnect this session, then ask for a Hi-MD disc.',
        confirmationToken: 'HIMD',
        endsSession: true,
    },
    {
        id: 'service-mode',
        capability: 'enterServiceMode',
        label: 'Enter service mode',
        description: 'Leave normal NetMD operation, enter the device service mode, and end this session.',
        confirmationToken: 'SERVICE',
        endsSession: true,
    },
];

export function canRunAdvancedMaintenanceAction(action: AdvancedMaintenanceAction, capabilities?: string[]) {
    return Boolean(capabilities?.includes(action.capability));
}

export function isAdvancedMaintenanceConfirmationValid(action: AdvancedMaintenanceAction, value: string) {
    return action.confirmationToken === undefined || value === action.confirmationToken;
}

import { actions as factoryBadSectorDialogActions } from './factory-bad-sector-dialog-feature';
import { actions as factoryActions } from '../factory/factory-feature';
import { batchActions } from '../../frontend-utils';
import { AppDispatch, RootState } from '../store';
import { actions as appStateActions } from '../app-feature';
import { downloadBlob, getTracks, Promised } from '../../utils';
import { ExploitCapability } from '../../services/interfaces/capabilities';
import { downloadTracks, exportCSV } from '../actions';
import JSZip from 'jszip';
import { AtracRecoveryConfig } from 'netmd-exploits';
import { getApplicationClient } from '../../application/runtime';
import { waitForApplicationTask } from '../../application/application-client';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from '../../application/interactive-authorization';
import { executeSessionEndingCommand } from '../../application/device-session-transition';
import { usesLegacyTaskPresentation } from '../../frontend/task-presentation';
import type { RawTocPatchKind } from '../../domain/raw-toc-patch';

function decodeBase64(data: string) {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function resolveExploitCapabilities(names: string[]) {
    return names
        .map((name) => ExploitCapability[name as keyof typeof ExploitCapability])
        .filter((capability): capability is ExploitCapability => typeof capability === 'number');
}

async function waitForAdvancedTask(taskId: string, fallbackError: string, reportFailure = true) {
    const task = await waitForApplicationTask(getApplicationClient(), taskId);
    if (reportFailure && (task.status === 'failed' || task.status === 'interrupted')) {
        throw new Error(task.error?.message ?? fallbackError);
    }
    return task;
}

export function initializeFactoryMode() {
    return async function(dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            const result = await getApplicationClient().execute({ type: 'advanced.inspect' });
            if (!result.ok) throw new Error(result.error.message);
            const info = result.advancedInfo;
            if (!info) throw new Error('Advanced device inspection did not return device information.');
            dispatch(
                batchActions([
                    factoryActions.setExploitCapabilities(resolveExploitCapabilities(info.capabilities)),
                    factoryActions.setFirmwareVersion(info.firmwareVersion),
                ])
            );
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function runTetris() {
    return async function(dispatch: AppDispatch) {
        if (!window.confirm('Run device-side Tetris homebrew code? This temporarily changes the device operating state.')) return;
        const client = getApplicationClient();
        await executeSessionEndingCommand(client, {
            type: 'advanced.runTetris',
            confirmation: { confirmed: true, reason: 'Confirmed in the advanced maintenance UI.' },
            interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
        });
        dispatch(appStateActions.setMainView('WELCOME'));
    };
}

export function downloadRam() {
    return async function(_dispatch: AppDispatch, getState: () => RootState) {
        const firmwareVersion = getState().factory.firmwareVersion;
        const task = await getApplicationClient().startLocalAdvancedMemoryExport('ram', (_region, data) => {
            const deviceName = getApplicationClient().getWorkspaceSnapshot().device?.deviceName ?? 'device';
            const fileName = `ram_${deviceName}_${firmwareVersion}.bin`;
            downloadBlob(new Blob([new Uint8Array(data)]), fileName);
        });
        await waitForAdvancedTask(task.id, 'Advanced RAM export failed.');
    };
}

export function downloadRom() {
    return async function(_dispatch: AppDispatch, getState: () => RootState) {
        const firmwareVersion = getState().factory.firmwareVersion;
        const task = await getApplicationClient().startLocalAdvancedMemoryExport('firmware', (region, data) => {
            const prefix = region === 'ROM' ? 'firmware' : region.toLowerCase();
            const deviceName = getApplicationClient().getWorkspaceSnapshot().device?.deviceName ?? 'device';
            const fileName = `${prefix}_${deviceName}_${firmwareVersion}.bin`;
            downloadBlob(new Blob([new Uint8Array(data)]), fileName);
        });
        await waitForAdvancedTask(task.id, 'Advanced firmware export failed.');
    };
}

export function downloadToc(callback: (blob: Blob, name: string) => void = downloadBlob) {
    return async function(dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            const result = await getApplicationClient().execute({ type: 'advanced.readToc' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedToc) throw new Error('Advanced TOC export did not return data.');
            const discTitle = getApplicationClient().getWorkspaceSnapshot().device?.disc?.title || 'disc';
            const fileName = `toc_${discTitle.replace(/[<>:"/\\|?*]/g, '_')}.bin`;
            callback(new Blob([decodeBase64(result.advancedToc.dataBase64)]), fileName);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}
export type BadSectorResponse = Promised<ReturnType<AtracRecoveryConfig['handleBadSector'] extends infer R | undefined ? R : never>>;

let badSectorPromise: ((a: { response: BadSectorResponse; rememberForTheRestOfDownload: boolean; rememberForTheRestOfSession: boolean; }) => void) | null = null;
let sessionStoredBadSectorHandling: null | BadSectorResponse = null;

export function reportBadSectorReponse(response: BadSectorResponse, rememberForTheRestOfDownload: boolean, rememberForTheRestOfSession: boolean) {
    return async function(dispatch: AppDispatch) {
        if (!badSectorPromise) {
            throw new Error('Invalid state!');
        }
        badSectorPromise({
            response,
            rememberForTheRestOfDownload,
            rememberForTheRestOfSession,
        });
        badSectorPromise = null;
        dispatch(factoryBadSectorDialogActions.setVisible(false));
    };
}

export function exploitDownloadTracks(
    trackIndexes: number[],
    convertOutputToWav: boolean,
    callback: (blob: Blob, name: string) => void = downloadBlob
) {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const disc = getApplicationClient().getWorkspaceSnapshot().device?.disc;
        if (!disc) throw new Error('No MiniDisc is loaded.');
        const settings = getApplicationClient().getWorkspaceSnapshot().settings.values;
        const useSlowerExploit = settings.factoryModeUseSlowerExploit;
        const nerawDownload = settings.factoryModeNERAWDownload;
        const tracks = getTracks(disc);
        if (nerawDownload && convertOutputToWav) {
            alert('Cannot convert to WAV and use NERAW files at the same time!');
            return;
        }
        const missing = trackIndexes.find((index) => !tracks.some((track) => track.index === index));
        if (missing !== undefined) {
            window.alert("This track does not exist. Make sure you've read the instructions on how to use the homebrew mode.");
            return;
        }

        let storedBadSectorHandling: null | BadSectorResponse = null;
        const task = await getApplicationClient().startLocalAdvancedTrackExport(
            {
                indexes: trackIndexes,
                convertToWav: convertOutputToWav,
                nerawDownload,
                useSlowerExploit,
            },
            (data, fileName) => callback(new Blob([new Uint8Array(data)]), fileName),
            async (address, count, seconds) => {
                if (sessionStoredBadSectorHandling !== null) return sessionStoredBadSectorHandling;
                if (storedBadSectorHandling !== null) return storedBadSectorHandling;
                dispatch(
                    batchActions([
                        factoryBadSectorDialogActions.setAddress(address),
                        factoryBadSectorDialogActions.setSeconds(seconds),
                        factoryBadSectorDialogActions.setCount(count),
                        factoryBadSectorDialogActions.setVisible(true),
                    ])
                );
                const result = await new Promise<{
                    response: BadSectorResponse;
                    rememberForTheRestOfDownload: boolean;
                    rememberForTheRestOfSession: boolean;
                }>((resolve) => (badSectorPromise = resolve));
                if (result.rememberForTheRestOfDownload) storedBadSectorHandling = result.response;
                if (result.rememberForTheRestOfSession) sessionStoredBadSectorHandling = result.response;
                return result.response;
            }
        );
        await waitForAdvancedTask(
            task.id,
            'Advanced track export failed.',
            usesLegacyTaskPresentation(getState().appState.mainView)
        );
    };
}

export async function checkFactoryCapability(dispatch: AppDispatch, capability: ExploitCapability){
    const client = getApplicationClient();
    const stopped = await client.execute({ type: 'playback.control', command: { action: 'stop' } });
    if (!stopped.ok) throw new Error(stopped.error.message);
    const result = await client.execute({ type: 'advanced.inspect' });
    if (!result.ok) throw new Error(result.error.message);
    if (!result.advancedInfo) throw new Error('Advanced device inspection did not return device information.');
    const capabilities = resolveExploitCapabilities(result.advancedInfo.capabilities);
    dispatch(
        batchActions([
            factoryActions.setExploitCapabilities(capabilities),
            factoryActions.setFirmwareVersion(result.advancedInfo.firmwareVersion),
        ])
    );
    return capabilities.includes(capability);
}

export function enableFactoryRippingModeInMainUi() {
    return async function(dispatch: AppDispatch) {
        if (!(await checkFactoryCapability(dispatch, ExploitCapability.downloadAtrac))) {
            window.alert(
                'Cannot enable homebrew mode ripping in main UI.\nThis device is not supported yet.\nStay tuned for future updates.'
            );
            return;
        }

        // At this point we're in the homebrew mode, and CSAR is allowed.
        // It's safe to enable this functionality.

        dispatch(appStateActions.setFactoryModeRippingInMainUi(true));
    };
}

export function applyTocFlagPatch(kind: RawTocPatchKind) {
    return async function(dispatch: AppDispatch) {
        const labels =
            kind === 'unrestrict-scms'
                ? { name: 'Remove SCMS restrictions', token: 'UNLOCK SCMS' }
                : { name: 'Clear track protection', token: 'UNPROTECT TRACKS' };
        const client = getApplicationClient();
        const preparedDevice = client.getWorkspaceSnapshot().device;
        if (!preparedDevice) throw new Error('No MiniDisc device is connected.');
        dispatch(appStateActions.setLoading(true));
        try {
            const previewResult = await client.execute({ type: 'advanced.previewTocPatch', kind });
            if (!previewResult.ok) throw new Error(previewResult.error.message);
            const preview = previewResult.advancedTocPatch;
            if (!preview) throw new Error('The device did not return a raw TOC change preview.');
            if (preview.changedFragments === 0) {
                window.alert(`${labels.name} is already applied. No write is needed.`);
                return;
            }
            const reviewedDevice = client.getWorkspaceSnapshot().device;
            if (
                reviewedDevice?.sessionId !== preparedDevice.sessionId ||
                reviewedDevice.revision !== preparedDevice.revision
            ) {
                throw new Error('The connected device or disc changed while the TOC flags were being reviewed. Review them again.');
            }
            const supplied = window.prompt(
                `${labels.name} will change ${preview.changedFragments} fragment${preview.changedFragments === 1 ? '' : 's'} across ${preview.changedTracks} track${preview.changedTracks === 1 ? '' : 's'}. Type ${labels.token} to continue.`
            );
            if (supplied !== labels.token) return;
            const result = await client.execute({
                type: 'advanced.applyTocPatch',
                kind,
                expectedCurrentTocSha256: preview.currentSha256,
                confirmation: { confirmed: true, reason: `Confirmed ${labels.name} in the compatibility menu.` },
                expectedRevision: preparedDevice.revision,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function archiveDisc() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const { archiveDiscCreateZip } = getApplicationClient().getWorkspaceSnapshot().settings.values;
        const canDownloadTracks =
            getApplicationClient().getWorkspaceSnapshot().device?.capabilities.includes('track.download') ?? false;
        let callback = downloadBlob;
        let zip: JSZip | null = null;
        if (archiveDiscCreateZip) {
            zip = new JSZip();
            const disallowedCharacters = /[<>:"/\\|?*]/g;
            callback = (blob: Blob, fileName: string) => zip!.file(fileName.replace(disallowedCharacters, '_'), blob);
        }
        const disc = getApplicationClient().getWorkspaceSnapshot().device?.disc;
        if (!disc) throw new Error('No MiniDisc is loaded.');

        await downloadToc(callback)(dispatch);
        await exportCSV(callback)(dispatch, getState);

        const indexes = getTracks(disc).map((track) => track.index);
        if (canDownloadTracks) {
            await downloadTracks(indexes, false, callback)(dispatch, getState);
        } else {
            await exploitDownloadTracks(indexes, false, callback)(dispatch, getState);
        }

        if (archiveDiscCreateZip) {
            dispatch(appStateActions.setLoading(true));
            try {
                const zipBlob = await zip!.generateAsync({ type: 'blob' });
                const zipName = (Object.keys(zip!.files).filter(n => n.endsWith('.csv'))[0] ?? 'Disc.csv').slice(0, -3) + 'zip';
                downloadBlob(zipBlob, zipName);
            } finally {
                dispatch(appStateActions.setLoading(false));
            }
        }
    };
}

export function toggleSPUploadSpeedup() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const spUploadSpeedupActive = getState().factory.spUploadSpeedupActive;
        const result = await getApplicationClient().execute({
            type: 'advanced.setSpUploadSpeedup',
            enabled: !spUploadSpeedupActive,
            interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
        });
        if (!result.ok) throw new Error(result.error.message);
        dispatch(factoryActions.setSPUploadSpedUp(!spUploadSpeedupActive));
    };
}

export function enterHiMDUnrestrictedMode() {
    return async function(dispatch: AppDispatch) {
        if (
            !window.confirm(
                'Warning: To enable the unrestricted mode the device will be temporarily exploited by running non-Sony code on them. The developers of Web Minidisc Pro aren\'t responsible for damaged devices. Do you want to continue?'
            )
        ) {
            return;
        }
        dispatch(appStateActions.setLoading(true));
        try {
            const client = getApplicationClient();
            await executeSessionEndingCommand(client, {
                type: 'advanced.enableHimdFullMode',
                confirmation: { confirmed: true, reason: 'Confirmed in the advanced maintenance UI.' },
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            window.alert('Loaded. Please insert a HiMD disc.');
            dispatch(appStateActions.setMainView('WELCOME'));
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function toggleDiscSwapDetection() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const deviceDiscSwapDetectionDisabled = getState().factory.deviceDiscSwapDetectionDisabled;
        dispatch(appStateActions.setLoading(true));
        try {
            const result = await getApplicationClient().execute({
                type: 'advanced.setDiscSwapDetectionDisabled',
                disabled: !deviceDiscSwapDetectionDisabled,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
            dispatch(factoryActions.setDiscSwapDetectionDisabled(!deviceDiscSwapDetectionDisabled));
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function enterServiceMode() {
    return async function(dispatch: AppDispatch) {
        if (!window.confirm('Enter device service mode? The current MiniDisc session will end and the device state will change.')) return;
        const client = getApplicationClient();
        await executeSessionEndingCommand(client, {
            type: 'advanced.enterServiceMode',
            confirmation: { confirmed: true, reason: 'Confirmed in the advanced maintenance UI.' },
            interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
        });
        dispatch(appStateActions.setMainView('WELCOME'));
    }
}

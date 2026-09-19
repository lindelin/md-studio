import { actions as factoryBadSectorDialogActions } from './factory-bad-sector-dialog-feature';
import { actions as factoryActions } from '../factory/factory-feature';
import { batchActions } from '../../frontend-utils';
import { AppDispatch, RootState } from '../store';
import { actions as appStateActions } from '../app-feature';
import { downloadBlob, getTracks, Promised } from '../../utils';
import { ExploitCapability } from '../../services/interfaces/capabilities';
import { parseTOC, getTitleByTrackNumber, reconstructTOC, updateFlagAllFragmentsOfTrack, ModeFlag, ToC } from 'netmd-tocmanip';
import { downloadTracks, exportCSV } from '../actions';
import JSZip from 'jszip';
import { AtracRecoveryConfig } from 'netmd-exploits';
import { getApplicationClient } from '../../application/runtime';
import { waitForApplicationTask } from '../../application/application-client';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from '../../application/interactive-authorization';
import { executeSessionEndingCommand } from '../../application/device-session-transition';

function decodeBase64(data: string) {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(data: Uint8Array) {
    let binary = '';
    for (let offset = 0; offset < data.byteLength; offset += 32_768) {
        binary += String.fromCharCode(...data.subarray(offset, Math.min(offset + 32_768, data.byteLength)));
    }
    return btoa(binary);
}

function resolveExploitCapabilities(names: string[]) {
    return names
        .map((name) => ExploitCapability[name as keyof typeof ExploitCapability])
        .filter((capability): capability is ExploitCapability => typeof capability === 'number');
}

async function waitForAdvancedTask(taskId: string, fallbackError: string) {
    const task = await waitForApplicationTask(getApplicationClient(), taskId);
    if (task.status === 'failed' || task.status === 'interrupted') {
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

export function readToc() {
    return async function(dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            const [infoResult, tocResult] = await Promise.all([
                getApplicationClient().execute({ type: 'advanced.inspect' }),
                getApplicationClient().execute({ type: 'advanced.readToc' }),
            ]);
            if (!infoResult.ok) throw new Error(infoResult.error.message);
            if (!tocResult.ok) throw new Error(tocResult.error.message);
            const info = infoResult.advancedInfo;
            const tocDump = tocResult.advancedToc;
            if (!info || !tocDump) throw new Error('Advanced TOC inspection returned an incomplete result.');
            const data = decodeBase64(tocDump.dataBase64);
            const sectors = Array.from({ length: tocDump.sectorCount }, (_, index) =>
                data.slice(index * tocDump.sectorSize, (index + 1) * tocDump.sectorSize)
            );
            const newToc = parseTOC(...sectors);
            dispatch(
                batchActions([
                    factoryActions.setToc(newToc),
                    factoryActions.setExploitCapabilities(resolveExploitCapabilities(info.capabilities)),
                    factoryActions.setFirmwareVersion(info.firmwareVersion),
                    factoryActions.setModified(false),
                ])
            );
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function editFragmentMode(index: number, mode: number) {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const toc = JSON.parse(JSON.stringify(getState().factory.toc));
        if (toc.trackFragmentList[index].mode !== mode) {
            dispatch(factoryActions.setModified(true));
        }
        toc.trackFragmentList[index].mode = mode;
        dispatch(factoryActions.setToc(toc));
    };
}

export function writeModifiedTOC() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        if (!window.confirm('Write the edited TOC to the disc? A malformed TOC can make every track unreadable.')) return;
        dispatch(appStateActions.setLoading(true));
        try {
            const toc = getState().factory.toc!;
            const sectors = reconstructTOC(toc, false);
            const data = new Uint8Array(2352 * 6);
            for (let index = 0; index < 6; index += 1) data.set(sectors[index]!, index * 2352);
            const client = getApplicationClient();
            const result = await client.execute({
                type: 'advanced.writeToc',
                dataBase64: encodeBase64(data),
                confirmation: { confirmed: true, reason: 'Confirmed in the advanced TOC editor.' },
                expectedRevision: client.getWorkspaceSnapshot().device?.revision,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.snapshot) throw new Error('Writing the advanced TOC did not return the device state.');
            dispatch(factoryActions.setModified(false));
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
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        dispatch(appStateActions.setLoading(true));
        try {
            const result = await getApplicationClient().execute({ type: 'advanced.readToc' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedToc) throw new Error('Advanced TOC export did not return data.');
            const fileName = `toc_${getTitleByTrackNumber(getState().factory.toc!, 0 /* Disc */)}.bin`;
            callback(new Blob([decodeBase64(result.advancedToc.dataBase64)]), fileName);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function uploadToc(file: File) {
    return async function(dispatch: AppDispatch) {
        if (file.size !== 2352 * 6) {
            window.alert('Not a valid TOC file');
            return;
        }
        dispatch(appStateActions.setLoading(true));
        try {
            const data = new Uint8Array(await file.arrayBuffer());
            const sectors = [];
            for (let i = 0; i < 6; i++) {
                sectors.push(data.slice(i * 2352, (i + 1) * 2352));
            }
            const toc = parseTOC(...sectors);
            dispatch(batchActions([factoryActions.setModified(true), factoryActions.setToc(toc)]));
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
    return async function(dispatch: AppDispatch, _getState: () => RootState) {
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
        await waitForAdvancedTask(task.id, 'Advanced track export failed.');
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

export function stripSCMS() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const toc = JSON.parse(JSON.stringify(getState().factory.toc));
        for (let track = 1; track <= toc?.nTracks; track++) {
            updateFlagAllFragmentsOfTrack(toc, track, ModeFlag.F_SCMS_DIG_COPY | ModeFlag.F_SCMS_UNRESTRICTED, true);
        }
        dispatch(batchActions([factoryActions.setModified(true), factoryActions.setToc(toc)]));
    };
}

export function stripTrProtect() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const toc = JSON.parse(JSON.stringify(getState().factory.toc));
        for (let track = 1; track <= toc?.nTracks; track++) {
            updateFlagAllFragmentsOfTrack(toc, track, ModeFlag.F_WRITABLE, true);
        }
        dispatch(batchActions([factoryActions.setModified(true), factoryActions.setToc(toc)]));
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
        let toc = getState().factory.toc;
        if (!toc) {
            await readToc()(dispatch);
            toc = getState().factory.toc!;
        }

        await downloadToc(callback)(dispatch, getState);
        await exportCSV(callback)(dispatch, getState);

        const indexes = Array(toc.nTracks)
            .fill(0)
            .map((_, i) => i);
        if (canDownloadTracks) {
            await downloadTracks(indexes, false, callback)(dispatch);
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

export function writeRecoveryTOC() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const toc: ToC = JSON.parse(JSON.stringify(getState().factory.toc));
        toc.nTracks = 1;
        toc.discNonEmpty = 1;
        toc.nextFreeTrackSlot = 2;
        toc.trackMap[1] = 1;
    }
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

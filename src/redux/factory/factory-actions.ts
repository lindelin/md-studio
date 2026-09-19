import { actions as factoryProgressDialogActions } from './factory-progress-dialog-feature';
import { actions as factoryBadSectorDialogActions } from './factory-bad-sector-dialog-feature';
import { actions as factoryActions } from '../factory/factory-feature';
import { batchActions } from '../../frontend-utils';
import { AppDispatch, RootState } from '../store';
import { actions as appStateActions } from '../app-feature';
import serviceRegistry from '../../services/registry';
import { convertToWAV, createDownloadTrackName, downloadBlob, getTracks, Promised } from '../../utils';
import { ExploitCapability, Capability } from '../../services/interfaces/netmd';
import { parseTOC, getTitleByTrackNumber, reconstructTOC, updateFlagAllFragmentsOfTrack, ModeFlag, ToC } from 'netmd-tocmanip';
import { downloadTracks, exportCSV } from '../actions';
import JSZip from 'jszip';
import { AtracRecoveryConfig } from 'netmd-exploits';
import { getApplicationClient } from '../../application/runtime';
import { applyDeviceSnapshot } from '../application-adapter';

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

export function initializeFactoryMode() {
    return async function(dispatch: AppDispatch) {
        if (serviceRegistry.netmdFactoryService !== undefined) return;
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
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.snapshot) throw new Error('Writing the advanced TOC did not return the device state.');
            applyDeviceSnapshot(dispatch, result.snapshot);
            dispatch(factoryActions.setModified(false));
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function runTetris() {
    return async function() {
        await serviceRegistry.netmdFactoryService!.runTetris();
    };
}

export function downloadRam() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const firmwareVersion = getState().factory.firmwareVersion;
        dispatch(
            batchActions([
                factoryProgressDialogActions.setDetails({
                    name: 'Transferring RAM',
                    units: 'bytes',
                }),
                factoryProgressDialogActions.setProgress({
                    current: 0,
                    total: 0,
                    additionalInfo: '',
                }),
                factoryProgressDialogActions.setCanBeCancelled(false),
                factoryProgressDialogActions.setVisible(true),
            ])
        );
        const ramData = await serviceRegistry.netmdFactoryService!.readRAM(
            ({ readBytes, totalBytes }: { readBytes: number; totalBytes: number }) => {
                dispatch(
                    factoryProgressDialogActions.setProgress({
                        current: readBytes,
                        total: totalBytes,
                    })
                );
            }
        );

        const fileName = `ram_${getState().main.deviceName}_${firmwareVersion}.bin`;
        downloadBlob(new Blob([ramData]), fileName);
        dispatch(factoryProgressDialogActions.setVisible(false));
    };
}

export function downloadRom() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        dispatch(
            batchActions([
                factoryProgressDialogActions.setDetails({
                    name: 'Transferring Firmware',
                    units: 'bytes',
                }),
                factoryProgressDialogActions.setCanBeCancelled(false),
                factoryProgressDialogActions.setVisible(true),
            ])
        );
        const firmwareData = await serviceRegistry.netmdFactoryService!.readFirmware(
            ({ type, readBytes, totalBytes }: { type: 'RAM' | 'ROM' | 'DRAM'; readBytes: number; totalBytes: number }) => {
                if (readBytes % 0x200 === 0)
                    dispatch(
                        factoryProgressDialogActions.setProgress({
                            current: readBytes,
                            total: totalBytes,
                            additionalInfo: type,
                        })
                    );
            }
        );
        const firmwareVersion = getState().factory.firmwareVersion;
        const fileName = `firmware_${getState().main.deviceName}_${firmwareVersion}.bin`;
        downloadBlob(new Blob([firmwareData.rom]), fileName);

        const fileName2 = `ram_${getState().main.deviceName}_${firmwareVersion}.bin`;
        downloadBlob(new Blob([firmwareData.ram]), fileName2);

        if (firmwareData.dram) {
            const fileName3 = `dram_${getState().main.deviceName}_${firmwareVersion}.bin`;
            downloadBlob(new Blob([firmwareData.dram]), fileName3);
        }
        dispatch(factoryProgressDialogActions.setVisible(false));
    };
}

export function downloadToc(callback: (blob: Blob, name: string) => void = downloadBlob) {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        dispatch(
            batchActions([
                factoryProgressDialogActions.setDetails({
                    name: 'Transferring TOC',
                    units: 'sectors',
                }),
                factoryProgressDialogActions.setProgress({
                    total: 6,
                    current: 0,
                }),
                factoryProgressDialogActions.setCanBeCancelled(false),
                factoryProgressDialogActions.setVisible(true),
            ])
        );
        const result = await getApplicationClient().execute({ type: 'advanced.readToc' });
        if (!result.ok) throw new Error(result.error.message);
        if (!result.advancedToc) throw new Error('Advanced TOC export did not return data.');
        dispatch(factoryProgressDialogActions.setProgress({ current: 6, total: 6 }));
        const fileName = `toc_${getTitleByTrackNumber(getState().factory.toc!, 0 /* Disc */)}.bin`;
        callback(new Blob([decodeBase64(result.advancedToc.dataBase64)]), fileName);
        dispatch(factoryProgressDialogActions.setVisible(false));
    };
}

export function uploadToc(file: File) {
    return async function(dispatch: AppDispatch) {
        if (file.size !== 2352 * 6) {
            window.alert('Not a valid TOC file');
            return;
        }
        dispatch(appStateActions.setLoading(true));

        const data = new Uint8Array(await file.arrayBuffer());
        const sectors = [];
        for (let i = 0; i < 6; i++) {
            sectors.push(data.slice(i * 2352, (i + 1) * 2352));
        }
        const toc = parseTOC(...sectors);
        dispatch(batchActions([factoryActions.setModified(true), factoryActions.setToc(toc), appStateActions.setLoading(false)]));
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
        // Verify if there even exists a track of that number
        const disc = getState().main.disc!;
        const useSlowerExploit = getState().appState.factoryModeUseSlowerExploit;
        const nerawDownload = getState().appState.factoryModeNERAWDownload;
        const tracks = getTracks(disc);
        try {
            await serviceRegistry.netmdService!.stop();
        } catch (ex) {
            /* Ignore */
        }

        if (nerawDownload && convertOutputToWav) {
            alert('Cannot convert to WAV and use NERAW files at the same time!');
            return;
        }

        dispatch(
            batchActions([
                factoryProgressDialogActions.setVisible(true),
                factoryProgressDialogActions.setCanBeCancelled(true),
                factoryProgressDialogActions.setDetails({
                    name: 'Initializing',
                    units: '',
                }),
                factoryProgressDialogActions.setProgress({
                    current: -1,
                    total: 0,
                    additionalInfo: 'Uploading code...',
                }),
            ])
        );
        await serviceRegistry.netmdFactoryService!.prepareDownload(useSlowerExploit);
        for (const trackIndex of trackIndexes) {
            if (trackIndex >= disc.trackCount) {
                window.alert("This track does not exist. Make sure you've read the instructions on how to use the homebrew mode.");
                return;
            }
            const track = tracks.find(n => n.index === trackIndex)!;
            dispatch(
                batchActions([
                    factoryProgressDialogActions.setDetails({
                        name: `Transferring track ${trackIndex + 1}`,
                        units: 'sectors',
                    }),
                    factoryProgressDialogActions.setProgress({
                        current: -1,
                        total: 0,
                        additionalInfo: 'Uploading code...',
                    }),
                ])
            );

            let timeout: ReturnType<typeof setTimeout> | null = null;

            let storedBadSectorHandling: null | BadSectorResponse = null;

            const trackData = await serviceRegistry.netmdFactoryService!.exploitDownloadTrack(
                trackIndex,
                nerawDownload,
                ({ total, read, action, sector }: { read: number; total: number; action: 'READ' | 'SEEK' | 'CHUNK'; sector?: string }) => {
                    if (timeout !== null) clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        dispatch(
                            factoryProgressDialogActions.setProgress({
                                current: Math.min(read, total),
                                total: total,
                                additionalInfo: {
                                    SEEK: 'Seeking...',
                                    CHUNK: 'Receiving...',
                                    READ: `Reading sector ${sector!}...`,
                                }[action],
                            })
                        );
                    }, 20);
                },
                {
                    shouldCancelImmediately: () => getState().factoryProgressDialog.cancelled,
                    handleBadSector: async (address: string, count: number, seconds: number) => {
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
                        }>(res => (badSectorPromise = res));
                        if (result.rememberForTheRestOfDownload) {
                            storedBadSectorHandling = result.response;
                        }
                        if (result.rememberForTheRestOfSession) {
                            sessionStoredBadSectorHandling = result.response;
                        }
                        return result.response;
                    },
                }
            );
            let filename = createDownloadTrackName(track, trackData.extension);
            if (convertOutputToWav) {
                trackData.data = await convertToWAV(trackData, track);
                filename = filename.slice(0, -3) + 'wav';
            }
            callback(new Blob([trackData.data]), filename);
            if (getState().factoryProgressDialog.cancelled) break;
        }
        await serviceRegistry.netmdFactoryService!.finalizeDownload();
        dispatch(factoryProgressDialogActions.setVisible(false));
    };
}

export async function checkFactoryCapability(dispatch: AppDispatch, capability: ExploitCapability){
    await serviceRegistry.netmdService!.stop();
    await initializeFactoryMode()(dispatch);

    const capabilities = await serviceRegistry.netmdFactoryService!.getExploitCapabilities();
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

        dispatch(batchActions([appStateActions.setFactoryModeRippingInMainUi(true), appStateActions.setLoading(false)]));
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
        const { archiveDiscCreateZip } = getState().appState;
        const { deviceCapabilities } = getState().main;
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
        if (deviceCapabilities.includes(Capability.trackDownload)) {
            await downloadTracks(indexes, false, callback)(dispatch);
        } else {
            await exploitDownloadTracks(indexes, false, callback)(dispatch, getState);
        }

        if (archiveDiscCreateZip) {
            dispatch(appStateActions.setLoading(true));
            const zipBlob = await zip!.generateAsync({ type: 'blob' });
            dispatch(appStateActions.setLoading(false));
            const zipName = (Object.keys(zip!.files).filter(n => n.endsWith('.csv'))[0] ?? 'Disc.csv').slice(0, -3) + 'zip';
            downloadBlob(zipBlob, zipName);
        }
    };
}

export function toggleSPUploadSpeedup() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const spUploadSpeedupActive = getState().factory.spUploadSpeedupActive;
        await serviceRegistry.netmdFactoryService!.setSPSpeedupActive(!spUploadSpeedupActive);
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
        await serviceRegistry.netmdFactoryService!.enableHiMDFullMode();
        window.alert('Loaded. Please insert a HiMD disc.');
        dispatch(appStateActions.setMainView('WELCOME'));
    };
}

export function toggleDiscSwapDetection() {
    return async function(dispatch: AppDispatch, getState: () => RootState) {
        const deviceDiscSwapDetectionDisabled = getState().factory.deviceDiscSwapDetectionDisabled;
        dispatch(appStateActions.setLoading(true));
        await serviceRegistry.netmdFactoryService!.setDiscSwapDetection(!deviceDiscSwapDetectionDisabled);
        dispatch(appStateActions.setLoading(false));
        dispatch(factoryActions.setDiscSwapDetectionDisabled(!deviceDiscSwapDetectionDisabled));
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
        dispatch(appStateActions.setMainView('WELCOME'));
        await serviceRegistry.netmdFactoryService!.enterServiceMode();
    }
}

import { batchActions } from '../frontend-utils';
import { AppDispatch, RootState } from './store';
import { actions as localLibraryActions } from './local-library-feature';
import { actions as uploadDialogActions } from './upload-dialog-feature';
import { actions as renameDialogActions } from './rename-dialog-feature';
import { actions as errorDialogAction } from './error-dialog-feature';
import { actions as recordDialogAction } from './record-dialog-feature';
import { actions as appStateActions } from './app-feature';
import { actions as convertDialogActions } from './convert-dialog-feature';
import { actions as songRecognitionDialogActions, TitleEntry } from './song-recognition-dialog-feature';
import { actions as songRecognitionProgressDialogActions } from './song-recognition-progress-dialog-feature';
import serviceRegistry from '../services/registry';
import { UnknownAction } from '@reduxjs/toolkit';
import {
    sleepWithProgressCallback,
    sleep,
    askNotificationPermission,
    timeToSeekArgs,
    TitledFile,
    downloadBlob,
    secondsToHumanReadable,
    getTracks,
    ffmpegTranscode,
} from '../utils';
import NotificationCompleteIconUrl from '../images/record-complete-notification-icon.png';
import { assertNumber } from 'netmd-js/dist/utils';
import { Capability, NetMDService, Codec, MinidiscSpec, ExploitCapability } from '../services/interfaces/netmd';
import { getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { checkFactoryCapability } from './factory/factory-actions';
import { s16LEToSamplesArray, Shazam } from 'shazam-api';
import { bindApplicationRuntime, getApplicationClient, releaseDeviceSession } from '../application/runtime';
import { applyDeviceSnapshot } from './application-adapter';
import { MetadataImportError } from '../domain/metadata-import';
import { resolveGroupedTrackMove } from '../domain/disc-layout';
import { describeDeviceSessionFailure, DeviceSessionConnector } from '../application/device-session';
import type { TaskSnapshot } from '../application/task-manager';
import { convertImportAudio } from '../application/audio-conversion-pipeline';
import { ImportUploadSessionError, runImportUploadSession } from '../application/import-upload-session';
import { finishRejectedImportWrite } from '../application/import-write-task';
import type { ApplicationCommand } from '../application/command-bus';
import type {
    AdvancedTrackReader,
    AdvancedUploadService,
    DeviceUploadService,
    PlaybackCommand,
} from '../application/contracts';

async function executeDeviceCommand(dispatch: AppDispatch, command: ApplicationCommand) {
    const result = await getApplicationClient().execute(command);
    if (!result.ok) throw new Error(result.error.message);
    if (!result.snapshot) throw new Error(`Command ${command.type} did not return the device state.`);
    applyDeviceSnapshot(dispatch, result.snapshot);
    return result.snapshot;
}

function currentDeviceRevision() {
    return getApplicationClient().getWorkspaceSnapshot().device?.revision;
}

export function requestTaskCancellation(id: string) {
    return async function () {
        const result = await getApplicationClient().execute({ type: 'task.cancel', id });
        if (!result.ok) throw new Error(result.error.message);
    };
}

export function disconnectDevice(finalize = true) {
    return async function (dispatch: AppDispatch) {
        const cleanup = releaseDeviceSession(finalize);
        dispatch(appStateActions.setMainView('WELCOME'));
        await cleanup;
    };
}

export function control(action: 'play' | 'stop' | 'next' | 'prev' | 'goto' | 'pause' | 'seek', params?: unknown) {
    return async function (dispatch: AppDispatch) {
        let command: PlaybackCommand;
        switch (action) {
            case 'play':
                command = { action: 'play' };
                break;
            case 'stop':
                command = { action: 'stop' };
                break;
            case 'next':
                command = { action: 'next' };
                break;
            case 'prev':
                command = { action: 'previous' };
                break;
            case 'pause':
                command = { action: 'pause' };
                break;
            case 'goto': {
                const trackNumber = assertNumber(params, 'Invalid track number for "goto" command');
                command = { action: 'gotoTrack', index: trackNumber };
                break;
            }
            case 'seek': {
                if (!(params instanceof Object)) {
                    throw new Error('"seek" command has wrong params');
                }
                const typedParams: { trackNumber: number; time: number } = params as any;
                const trackNumber = assertNumber(typedParams.trackNumber, 'Invalid track number for "seek" command');
                const time = assertNumber(typedParams.time, 'Invalid time for "seek" command');
                const timeArgs = timeToSeekArgs(time);
                command = {
                    action: 'seek',
                    index: trackNumber,
                    hour: timeArgs[0],
                    minute: timeArgs[1],
                    second: timeArgs[2],
                    frame: timeArgs[3],
                };
                break;
            }
        }
        await executeDeviceCommand(dispatch, { type: 'playback.control', command });
        // CAVEAT: change-track might take a up to a few seconds to complete.
        // We wait 500ms and let the monitor do further updates
        await sleep(500);
        try {
            await executeDeviceCommand(dispatch, { type: 'disc.refresh' });
        } catch (e) {
            console.log('control: Cannot get device status');
        }
    };
}

export function renameGroup({ groupIndex, newName, newFullWidthName }: { groupIndex: number; newName: string; newFullWidthName?: string }) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'group.rename',
                update: { index: groupIndex, title: newName, fullWidthTitle: newFullWidthName },
                expectedRevision: currentDeviceRevision(),
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function groupTracks(indexes: number[]) {
    return async function (dispatch: AppDispatch) {
        const begin = indexes[0];
        const length = indexes[indexes.length - 1] - begin + 1;
        await executeDeviceCommand(dispatch, {
            type: 'group.create',
            firstTrack: begin,
            trackCount: length,
            expectedRevision: currentDeviceRevision(),
        });
    };
}

export function deleteGroups(indexes: number[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'group.deleteMany',
                indexes,
                expectedRevision: currentDeviceRevision(),
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function dragDropTrack(sourceList: number, sourceIndex: number, targetList: number, targetIndex: number) {
    return async function (dispatch: AppDispatch): Promise<void> {
        if (sourceList === targetList && sourceIndex === targetIndex) return;
        dispatch(appStateActions.setLoading(true));
        try {
            const client = getApplicationClient();
            const snapshot =
                client.getWorkspaceSnapshot().device ?? (await executeDeviceCommand(dispatch, { type: 'disc.refresh' }));
            if (!snapshot.disc) return;
            const move = resolveGroupedTrackMove(snapshot.disc, sourceList, sourceIndex, targetList, targetIndex);
            if (move.sourceIndex === move.destinationIndex) return;
            await executeDeviceCommand(dispatch, {
                type: 'track.move',
                sourceIndex: move.sourceIndex,
                destinationIndex: move.destinationIndex,
                expectedRevision: snapshot.revision,
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function addService(info: ServiceConstructionInfo) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const { availableServices } = getState().appState;
        dispatch(appStateActions.setAvailableServices([...availableServices, info]));
    };
}

export function deleteService(index: number) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        if (index < getSimpleServices().length) return;
        const availableServices = [...getState().appState.availableServices];
        availableServices.splice(index, 1);
        dispatch(appStateActions.setLastSelectedService(0));
        dispatch(appStateActions.setAvailableServices(availableServices));
    };
}

export function pair(serviceInstance: NetMDService, spec: MinidiscSpec) {
    return async function (dispatch: AppDispatch) {
        dispatch(
            batchActions([
                appStateActions.setPairingFailed(false),
                appStateActions.setConnectingInProgress(true),
                appStateActions.setFactoryModeRippingInMainUi(false),
            ])
        );

        try {
            serviceRegistry.mediaSessionService?.init(); // no need to await

            await serviceRegistry.audioEncoderManager.getService();

            const session = await new DeviceSessionConnector(serviceRegistry, bindApplicationRuntime).connect(serviceInstance, spec);
            if (session.cachedConnectionError) console.error(session.cachedConnectionError);
            if (session.application) {
                dispatch(
                    batchActions([
                        appStateActions.setMainView('MAIN'),
                        errorDialogAction.setErrorMessage(''),
                        errorDialogAction.setVisible(false),
                    ])
                );
                return;
            }
            dispatch(
                batchActions([
                    appStateActions.setPairingMessage(describeDeviceSessionFailure(session)),
                    appStateActions.setPairingFailed(true),
                ])
            );
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : String(err);
            dispatch(
                batchActions([appStateActions.setPairingMessage(message || 'Unknown Error!'), appStateActions.setPairingFailed(true)])
            );
        } finally {
            dispatch(appStateActions.setConnectingInProgress(false));
        }
    };
}

export function listContent(dropCache: boolean = false) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, { type: 'disc.refresh', dropCache });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function renameTrack(...entries: { index: number; newName: string; newFullWidthName?: string }[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(batchActions([renameDialogActions.setVisible(false), appStateActions.setLoading(true)]));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'track.renameMany',
                updates: entries.map(({ index, newName, newFullWidthName }) => ({
                    index,
                    title: newName,
                    fullWidthTitle: newFullWidthName,
                })),
                expectedRevision: currentDeviceRevision(),
            });
        } catch (err) {
            console.error(err);
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(`Rename failed.`),
                    appStateActions.setLoading(false),
                ])
            );
        }
        dispatch(appStateActions.setLoading(false));
    };
}

export function himdRenameTrack(...entries: { index: number; title?: string; album?: string; artist?: string }[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(batchActions([renameDialogActions.setVisible(false), appStateActions.setLoading(true)]));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'track.renameHimdMany',
                updates: entries,
                expectedRevision: currentDeviceRevision(),
            });
        } catch (err) {
            console.error(err);
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(`Rename failed.`),
                    appStateActions.setLoading(false),
                ])
            );
        }
        dispatch(appStateActions.setLoading(false));
    };
}

export function renameDisc({ newName, newFullWidthName }: { newName: string; newFullWidthName?: string }) {
    return async function (dispatch: AppDispatch) {
        await executeDeviceCommand(dispatch, {
            type: 'disc.rename',
            title: newName.replace(/\/\//g, ' /'),
            fullWidthTitle: newFullWidthName?.replace(/／／/g, '／'),
            expectedRevision: currentDeviceRevision(),
        });
        dispatch(renameDialogActions.setVisible(false));
    };
}

export function deleteTracks(indexes: number[]) {
    return async function (dispatch: AppDispatch) {
        const confirmation = window.confirm(
            `Proceed with Delete Track${indexes.length !== 1 ? 's' : ''}? This operation cannot be undone.`
        );
        if (!confirmation) {
            return;
        }
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'track.deleteMany',
                indexes,
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in the MiniDisc Workspace user interface',
                },
                expectedRevision: currentDeviceRevision(),
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function wipeDisc() {
    return async function (dispatch: AppDispatch) {
        const confirmation = window.confirm(`Proceed with Wipe Disc? This operation cannot be undone.`);
        if (!confirmation) {
            return;
        }
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'disc.erase',
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in the MiniDisc Workspace user interface',
                },
                expectedRevision: currentDeviceRevision(),
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function formatToHiMD() {
    return async function (dispatch: AppDispatch) {
        const confirmation = window.confirm(`Format the disc to HiMD? This operation cannot be undone.`);
        if (!confirmation) {
            return;
        }
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, {
                type: 'disc.formatHimd',
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in the MiniDisc Workspace user interface',
                },
                expectedRevision: currentDeviceRevision(),
            });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function ejectDisc() {
    return async function (dispatch: AppDispatch) {
        await executeDeviceCommand(dispatch, { type: 'disc.eject', expectedRevision: currentDeviceRevision() });
    };
}

export function moveTrack(srcIndex: number, destIndex: number) {
    return async function (dispatch: AppDispatch) {
        await executeDeviceCommand(dispatch, {
            type: 'track.move',
            sourceIndex: srcIndex,
            destinationIndex: destIndex,
            expectedRevision: currentDeviceRevision(),
        });
    };
}

async function monitorTaskInRecordDialog(dispatch: AppDispatch, initialTask: TaskSnapshot, fallbackError: string) {
    const client = getApplicationClient();
    let task = initialTask;
    dispatch(batchActions([recordDialogAction.setVisible(true), recordDialogAction.setTaskId(task.id)]));
    try {
        while (task.status === 'queued' || task.status === 'running') {
            const bytesTotal = task.progress.bytesTotal ?? 0;
            dispatch(
                recordDialogAction.setProgress({
                    trackTotal: task.progress.total,
                    trackDone: task.progress.completed,
                    trackCurrent:
                        task.progress.currentPercent ??
                        (bytesTotal > 0 ? (100 * (task.progress.bytesWritten ?? 0)) / bytesTotal : -1),
                    titleCurrent: task.progress.currentLabel ?? '',
                })
            );
            await sleep(100);
            const currentTask = client.getWorkspaceSnapshot().tasks.find((candidate) => candidate.id === task.id);
            if (!currentTask) throw new Error(`Task ${task.id} is no longer available.`);
            task = currentTask;
        }
        if (task.status === 'failed') {
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(task.error?.message ?? fallbackError),
                ])
            );
        }
    } finally {
        dispatch(batchActions([recordDialogAction.setVisible(false), recordDialogAction.setTaskId(null)]));
    }
}

export function downloadTracks(
    indexes: number[],
    convertOutputToWav: boolean,
    callback?: (blob: Blob, name: string) => void
) {
    return async function (dispatch: AppDispatch): Promise<void> {
        const request = {
            indexes,
            convertToWav: convertOutputToWav,
            expectedRevision: currentDeviceRevision(),
        };
        let task;
        try {
            if (callback) {
                task = await getApplicationClient().startLocalTrackExport(
                    request,
                    (data, fileName) => {
                        const copy = new Uint8Array(data.byteLength);
                        copy.set(data);
                        callback(new Blob([copy.buffer], { type: 'application/octet-stream' }), fileName);
                    }
                );
            } else {
                const result = await getApplicationClient().execute({ type: 'track.export', ...request });
                if (!result.ok) throw new Error(result.error.message);
                task = result.task;
            }
        } catch (error) {
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(error instanceof Error ? error.message : 'Track export could not be started.'),
                ])
            );
            return;
        }
        if (!task) return;
        await monitorTaskInRecordDialog(dispatch, task, 'Track export failed.');
    };
}

export function recordTracks(indexes: number[], deviceId: string) {
    return async function (dispatch: AppDispatch): Promise<void> {
        try {
            const result = await getApplicationClient().execute({
                type: 'track.record',
                indexes,
                deviceId,
                expectedRevision: currentDeviceRevision(),
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.task) throw new Error('Audio-input recording could not be started.');
            await monitorTaskInRecordDialog(dispatch, result.task, 'Audio-input recording failed.');
        } catch (error) {
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(error instanceof Error ? error.message : 'Audio-input recording failed.'),
                ])
            );
        }
    };
}

export function renameInConvertDialog({ index, newName, newFullWidthName }: { index: number; newName: string; newFullWidthName: string }) {
    return async function () {
        const client = getApplicationClient();
        const snapshot = client.getWorkspaceSnapshot().imports;
        const item = snapshot.items[index];
        if (!item) throw new Error(`Import queue item ${index} does not exist.`);
        const result = await client.execute({
            type: 'import.update',
            id: item.id,
            changes: { title: newName, fullWidthTitle: newFullWidthName },
            expectedRevision: snapshot.revision,
        });
        if (!result.ok) throw new Error(result.error.message);
    };
}

export function renameInConvertDialogHiMD({
    index,
    title,
    album,
    artist,
}: {
    index: number;
    title: string;
    album: string;
    artist: string;
}) {
    return async function () {
        const client = getApplicationClient();
        const snapshot = client.getWorkspaceSnapshot().imports;
        const item = snapshot.items[index];
        if (!item) throw new Error(`Import queue item ${index} does not exist.`);
        const result = await client.execute({
            type: 'import.update',
            id: item.id,
            changes: { title, artist, album },
            expectedRevision: snapshot.revision,
        });
        if (!result.ok) throw new Error(result.error.message);
    };
}

export function renameInSongRecognitionDialog({
    index,
    newName,
    newFullWidthName,
}: {
    index: number;
    newName: string;
    newFullWidthName: string;
}) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const newTitles = [...getState().songRecognitionDialog.titles];
        newTitles.splice(index, 1, {
            ...newTitles[index],
            manualOverrideNewTitle: newName,
            manualOverrideNewFullWidthTitle: newFullWidthName,

            selectedToRecognize: true,
            recognizeFail: false,
            alreadyRecognized: true,
        });
        dispatch(songRecognitionDialogActions.setTitles(newTitles));
    };
}

export function selfTest() {
    return async function (dispatch: AppDispatch) {
        if (!window.confirm('Warning - This is a destructive self test. THE DISC WILL BE ERASED! Continue?')) return;
        const client = getApplicationClient();
        const started = await client.execute({
            type: 'diagnostics.selfTest',
            confirmation: { confirmed: true, reason: 'Confirmed in the device diagnostics UI.' },
        });
        if (!started.ok || !started.task) {
            window.alert(started.ok ? 'The self-test could not be started.' : started.error.message);
            return;
        }

        dispatch(recordDialogAction.setVisible(true));
        let task = started.task;
        while (task.status === 'queued' || task.status === 'running') {
            dispatch(
                recordDialogAction.setProgress({
                    trackTotal: task.progress.total,
                    trackDone: task.progress.completed,
                    trackCurrent: task.progress.total === 0 ? 0 : (task.progress.completed / task.progress.total) * 100,
                    titleCurrent: `Self-Test: ${task.progress.currentLabel ?? task.phase}`,
                })
            );
            await sleep(100);
            const currentTask = client.getWorkspaceSnapshot().tasks.find((candidate) => candidate.id === task.id);
            if (!currentTask) throw new Error(`Task ${task.id} is no longer available.`);
            task = currentTask;
        }
        const refreshed = await client.execute({ type: 'disc.refresh', dropCache: true });
        if (refreshed.ok && refreshed.snapshot) applyDeviceSnapshot(dispatch, refreshed.snapshot);
        dispatch(recordDialogAction.setVisible(false));
        if (task.status === 'succeeded') {
            console.info('All device self-tests passed.', task.result);
            window.alert('All device self-tests passed. The test disc is now empty.');
        } else {
            console.error('The device self-test did not complete.', task);
            window.alert(task.error?.message ?? `The device self-test ended with status ${task.status}.`);
        }
    };
}
export function setNotifyWhenFinished(value: boolean) {
    return async function (dispatch: AppDispatch) {
        if (Notification.permission !== 'granted') {
            const confirmation = window.confirm(`Enable Notification on recording completed?`);
            if (!confirmation) {
                return;
            }
            const result = await askNotificationPermission();
            if (result !== 'granted') {
                dispatch(appStateActions.setNotificationSupport(false));
                dispatch(appStateActions.setNotifyWhenFinished(false));
                return;
            }
        }
        dispatch(appStateActions.setNotifyWhenFinished(value));
    };
}

export function exportCSV(callback: (blob: Blob, name: string) => void = downloadBlob) {
    return async function (dispatch: AppDispatch, _getState: () => RootState) {
        void _getState;
        dispatch(appStateActions.setLoading(true));
        try {
            const result = await getApplicationClient().execute({ type: 'metadata.exportCsv' });
            if (!result.ok) throw new Error(result.error.message);
            const exported = result.metadataCsv;
            if (!exported) throw new Error('Metadata export did not return a CSV document.');
            callback(new Blob([exported.text]), exported.fileName);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function importCSV(file: File) {
    return async function (dispatch: AppDispatch) {
        const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
        dispatch(appStateActions.setLoading(true));
        try {
            const client = getApplicationClient();
            const expectedRevision = client.getWorkspaceSnapshot().device?.revision;
            const planned = await client.execute({ type: 'metadata.planCsv', text });
            if (!planned.ok) throw new MetadataImportError(planned.error.message);
            const plan = planned.metadataPlan;
            if (!plan) throw new Error('Metadata import did not return a validation plan.');
            if (
                !plan.trackCountMatches &&
                !window.confirm(
                    `The CSV file describes a disc with ${plan.expectedTrackCount} tracks.\nThe disc inserted has ${
                        plan.disc.trackCount
                    } tracks.\nContinue importing?`
                )
            ) {
                return;
            }

            const includedTrackIndexes = new Set<number>();
            for (const track of plan.tracks) {
                if (!track.actual) continue;
                if (!track.matchesDisc) {
                    const bitrateDescription = track.bitrate === undefined ? '' : ` (${track.bitrate} kbps)`;
                    const actualBitrateDescription =
                        track.actual.encoding.bitrate === undefined ? '' : ` (${track.actual.encoding.bitrate} kbps)`;
                    if (
                        !window.confirm(
                            `The CSV file describes track ${track.index} as a ${secondsToHumanReadable(track.duration)} ${
                                track.codec
                            }${bitrateDescription} track. The actual track ${track.index} is a ${secondsToHumanReadable(
                                track.actual.duration
                            )} ${track.actual.encoding.codec}${actualBitrateDescription} track. Label it according to the file?`
                        )
                    ) {
                        continue;
                    }
                }
                includedTrackIndexes.add(track.trackIndex);
            }
            const applied = await client.execute({
                type: 'metadata.applyCsv',
                text,
                includedTrackIndexes: [...includedTrackIndexes],
                expectedRevision,
            });
            if (!applied.ok) throw new Error(applied.error.message);
            if (!applied.snapshot) throw new Error('Metadata import did not return the device state.');
            applyDeviceSnapshot(dispatch, applied.snapshot);
        } catch (error) {
            if (error instanceof MetadataImportError) {
                window.alert(error.message);
                return;
            }
            throw error;
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function openRecognizeTrackDialog(selectedTracks: number[]) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const { deviceCapabilities } = getState().main;
        if (deviceCapabilities.length > 0 && !deviceCapabilities.includes(Capability.factoryMode)) {
            dispatch(songRecognitionDialogActions.setImportMethod('line-in'));
        }

        dispatch(
            batchActions([
                songRecognitionDialogActions.setTitles(
                    getTracks(getState().main.disc!)
                        .sort((a, b) => a.index - b.index)
                        .map((track) => ({
                            originalTitle: track.title ?? '',
                            originalFullWidthTitle: track.fullWidthTitle ?? '',
                            index: track.index,

                            newTitle: '',
                            newFullWidthTitle: '',
                            manualOverrideNewTitle: '',
                            manualOverrideNewFullWidthTitle: '',

                            unsanitizedTitle: null,

                            songAlbum: '',
                            songArtist: '',
                            songTitle: '',

                            selectedToRecognize: selectedTracks.includes(track.index),
                            alreadyRecognized: false,
                            recognizeFail: false,
                        }))
                ),
                songRecognitionDialogActions.setVisible(true),
            ])
        );
    };
}

export function recognizeTracks(_trackEntries: TitleEntry[], mode: 'exploits' | 'line-in', inputModeConfiguration?: { deviceId?: string }) {
    const trackEntries = [..._trackEntries];
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const shazam = new Shazam();

        // Bypass CORS
        shazam.endpoint.sendRecognizeRequest = async (url: string, body: string) => {
            return await window.native!.unrestrictedFetchJSON(url, {
                method: 'POST',
                body,
                headers: shazam.endpoint.headers(),
            });
        };

        const toRecognize = trackEntries.filter((n) => n.selectedToRecognize && !n.alreadyRecognized);

        dispatch(
            batchActions([
                songRecognitionProgressDialogActions.setCancelled(false),
                songRecognitionProgressDialogActions.setVisible(true),
                songRecognitionProgressDialogActions.setCurrentTrack(0),
                songRecognitionProgressDialogActions.setTotalTracks(toRecognize.length),
            ])
        );

        if (mode === 'exploits') {
            if (!(await checkFactoryCapability(dispatch, ExploitCapability.downloadAtrac))) {
                window.alert(
                    'Cannot enable homebrew mode ripping in main UI.\nThis device is not supported yet.\nStay tuned for future updates.'
                );
                dispatch(songRecognitionProgressDialogActions.setVisible(false));
                return;
            }
        }

        const runRecognition = async (readAdvancedTrack?: AdvancedTrackReader) => {
            let toRecognizeTrackCounter = -1;
            for (let i = 0; i < trackEntries.length; i++) {
                const trackEntry = trackEntries[i];
                if (!trackEntry.selectedToRecognize || trackEntry.alreadyRecognized) {
                    continue;
                }
                const TRY_COUNT = 3;
                const SECONDS_TO_READ = 12;
                const MIN_DURATION = SECONDS_TO_READ * TRY_COUNT;

                // TRY_COUNT tries to get the song right:
                const track = getTracks(getState().main.disc!).find((e) => e.index === trackEntry.index)!;

                if (track.duration < MIN_DURATION) {
                    trackEntries[i] = {
                        ...trackEntries[i],
                        recognizeFail: true,
                    };
                    continue;
                }
                toRecognizeTrackCounter++;
                dispatch(songRecognitionProgressDialogActions.setCurrentTrack(toRecognizeTrackCounter));

                for (let offset = 0; offset < SECONDS_TO_READ * TRY_COUNT; offset += SECONDS_TO_READ) {
                    let rawSamples: Uint8Array;
                    dispatch(
                        batchActions([
                            songRecognitionProgressDialogActions.setCurrentStep(0),
                            songRecognitionProgressDialogActions.setCurrentStepProgress(0),
                            songRecognitionProgressDialogActions.setCurrentStepTotal(1),
                        ])
                    );

                    const optimalStartSeconds = offset;

                    if (mode === 'exploits') {
                        // Download the track

                        if (!readAdvancedTrack) throw new Error('The advanced track reader is unavailable.');
                        const atracData = await readAdvancedTrack(
                            trackEntry.index,
                            {
                                nerawDownload: false,
                                shouldCancel: () => getState().songRecognitionProgressDialog.cancelled,
                                handleBadSector: async () => 'abort',
                                secondsToRead: SECONDS_TO_READ,
                                startSeconds: optimalStartSeconds,
                                writeHeader: true,
                            },
                            (e) =>
                                dispatch(
                                    batchActions([
                                        songRecognitionProgressDialogActions.setCurrentStepProgress(e.read),
                                        songRecognitionProgressDialogActions.setCurrentStepTotal(e.total),
                                    ])
                                )
                        );

                        dispatch(
                            batchActions([
                                songRecognitionProgressDialogActions.setCurrentStepProgress(-1),
                                songRecognitionProgressDialogActions.setCurrentStepTotal(0),
                                songRecognitionProgressDialogActions.setCurrentStep(1),
                            ])
                        );

                        rawSamples = await ffmpegTranscode(atracData.data, atracData.extension, '-ar 16000 -ac 1 -f s16le');
                    } else {
                        const deviceId = inputModeConfiguration!.deviceId!;
                        dispatch(songRecognitionProgressDialogActions.setCurrentStepTotal(100));
                        const mediaRecorderService = serviceRegistry.mediaRecorderService;
                        if (!mediaRecorderService) throw new Error('The browser audio recording service is unavailable.');
                        const client = getApplicationClient();
                        const device = client.getWorkspaceSnapshot().device;
                        if (!device) throw new Error('The MiniDisc device disconnected before recognition started.');
                        const rawWav = await client.runLocalPlaybackCaptureSession(
                            { sessionId: device.sessionId, revision: device.revision },
                            async (playback) => {
                                let recordingStarted = false;
                                await playback.control({ action: 'stop' });
                                await playback.control({ action: 'gotoTrack', index: track.index });
                                const seek = timeToSeekArgs(optimalStartSeconds);
                                await playback.control({
                                    action: 'seek',
                                    index: track.index,
                                    hour: seek[0],
                                    minute: seek[1],
                                    second: seek[2],
                                    frame: seek[3],
                                });
                                await playback.control({ action: 'play' });
                                await mediaRecorderService.initStream(deviceId);
                                try {
                                    await mediaRecorderService.startRecording();
                                    recordingStarted = true;
                                    await sleepWithProgressCallback(
                                        SECONDS_TO_READ * 1000,
                                        (percentage: number) => {
                                            dispatch(
                                                songRecognitionProgressDialogActions.setCurrentStepProgress(percentage)
                                            );
                                        },
                                        () => getState().songRecognitionProgressDialog.cancelled
                                    );
                                    await mediaRecorderService.stopRecording();
                                    recordingStarted = false;
                                    return new Promise<Uint8Array>((resolve) =>
                                        mediaRecorderService.recorder.exportWAV(async (blob: Blob) =>
                                            resolve(new Uint8Array(await blob.arrayBuffer()))
                                        )
                                    );
                                } finally {
                                    if (recordingStarted) {
                                        await mediaRecorderService
                                            .stopRecording()
                                            .catch((error) => console.error('Could not stop recognition recording.', error));
                                    }
                                    await mediaRecorderService.closeStream();
                                }
                            }
                        );
                        dispatch(
                            batchActions([
                                songRecognitionProgressDialogActions.setCurrentStepProgress(-1),
                                songRecognitionProgressDialogActions.setCurrentStepTotal(0),
                                songRecognitionProgressDialogActions.setCurrentStep(1),
                            ])
                        );
                        rawSamples = await ffmpegTranscode(rawWav, 'wav', '-ar 16000 -ac 1 -f s16le');
                    }
                    dispatch(batchActions([songRecognitionProgressDialogActions.setCurrentStepProgress(-1)]));

                    const songData = await shazam.recognizeSong(s16LEToSamplesArray(rawSamples), (state) =>
                        dispatch(songRecognitionProgressDialogActions.setCurrentStep(state === 'generating' ? 1 : 2))
                    );
                    if (songData !== null) {
                        trackEntries[i] = {
                            ...trackEntries[i],
                            alreadyRecognized: true,
                            recognizeFail: false,

                            songTitle: songData.title,
                            songArtist: songData.artist,
                            songAlbum: songData.album ?? 'Unknown',
                        };
                        break;
                    } else {
                        trackEntries[i] = {
                            ...trackEntries[i],
                            recognizeFail: true,
                        };
                    }
                    if (getState().songRecognitionProgressDialog.cancelled) break;
                }
                if (getState().songRecognitionProgressDialog.cancelled) break;
            }
        };
        if (mode === 'exploits') {
            await getApplicationClient().runLocalAdvancedTrackDownloadSession(
                getState().appState.factoryModeUseSlowerExploit,
                runRecognition
            );
        } else {
            await runRecognition();
        }
        dispatch(
            batchActions([songRecognitionDialogActions.setTitles(trackEntries), songRecognitionProgressDialogActions.setVisible(false)])
        );
    };
}

export function flushDevice() {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand(dispatch, { type: 'device.flush', expectedRevision: currentDeviceRevision() });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function convertAndUpload(
    files: TitledFile[],
    format: Codec,
    additionalParameters: { enableReplayGain: boolean; enableGapless: boolean },
    options: {
        taskId?: string;
        operationLockHeld?: boolean;
        preflightComplete?: boolean;
        uploadService?: DeviceUploadService;
        advancedUploadService?: AdvancedUploadService;
        deviceVersion?: { sessionId: string; revision: number };
    } = {}
) {
    return async function (dispatch: AppDispatch, getState: () => RootState): Promise<void> {
        const deviceCapabilities = getApplicationClient().getWorkspaceSnapshot().device?.capabilities ?? [];
        const usesAtrac1Upload = files.some((e) => e.forcedEncoding?.codec === 'SPS' || e.forcedEncoding?.codec === 'SPM');
        const usesMonoUploadExploit = format.codec === 'SPM' && !deviceCapabilities.includes('track.uploadMono');
        if (!options.preflightComplete && usesAtrac1Upload) {
            if (!deviceCapabilities.includes('advanced.factory')) {
                const message = 'This device cannot enter Homebrew mode, so ATRAC1 upload is unavailable.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'unavailable',
                    reason: message,
                    pendingItems: files.length,
                    recoveryAction: 'Choose an LP recording mode or connect a device that supports ATRAC1 upload.',
                });
                return;
            } else if (
                !window.confirm(
                    "To upload ATRAC1 files back onto the MD, you're required to enter the homebrew mode.\nDo you want to continue?"
                )
            ) {
                const message = 'ATRAC1 upload was cancelled before any tracks were transferred.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'cancelled',
                    reason: message,
                    pendingItems: files.length,
                });
                return;
            } else if (!(await checkFactoryCapability(dispatch, ExploitCapability.uploadAtrac1))) {
                const message = 'This device does not support the ATRAC1 upload exploit.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'unavailable',
                    reason: message,
                    pendingItems: files.length,
                    recoveryAction: 'Choose an LP recording mode or connect a compatible device.',
                });
                return;
            }
        }
        if (!options.preflightComplete && files.length === 0) {
            finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                kind: 'cancelled',
                reason: 'The write request did not contain any tracks.',
                pendingItems: 0,
            });
            return;
        }

        if (!options.preflightComplete && usesMonoUploadExploit) {
            // SP MONO is a homebrew feature
            if (!deviceCapabilities.includes('advanced.factory')) {
                const message = 'This device cannot enter Homebrew mode, so SP MONO upload is unavailable.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'unavailable',
                    reason: message,
                    pendingItems: files.length,
                    recoveryAction: 'Choose a stereo recording mode or connect a device with native Mono upload support.',
                });
                dispatch(convertDialogActions.setVisible(true));
                return;
            } else if (
                !window.confirm(
                    "To upload MONO ATRAC files onto the MD, you're required to enter the homebrew mode.\nDo you want to continue?"
                )
            ) {
                const message = 'SP MONO upload was cancelled before any tracks were transferred.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'cancelled',
                    reason: message,
                    pendingItems: files.length,
                });
                dispatch(convertDialogActions.setVisible(true));
                return;
            } else if (!(await checkFactoryCapability(dispatch, ExploitCapability.uploadMonoSP))) {
                const message = 'This device does not support the SP MONO upload exploit.';
                window.alert(message);
                finishRejectedImportWrite(serviceRegistry.taskManager, options.taskId, {
                    kind: 'unavailable',
                    reason: message,
                    pendingItems: files.length,
                    recoveryAction: 'Choose a stereo recording mode or connect a compatible device.',
                });
                dispatch(convertDialogActions.setVisible(true));
                return;
            }

        }

        if (!options.preflightComplete) {
            const requiredExploitCapabilities = [
                usesAtrac1Upload && 'uploadAtrac1',
                usesMonoUploadExploit && 'uploadMonoSP',
            ].filter((value): value is string => Boolean(value));
            const client = getApplicationClient();
            try {
                await client.runLocalDeviceUploadSession(
                    requiredExploitCapabilities,
                    (uploadService, advancedUploadService) =>
                        convertAndUpload(files, format, additionalParameters, {
                            ...options,
                            operationLockHeld: true,
                            preflightComplete: true,
                            uploadService,
                            advancedUploadService,
                        })(dispatch, getState),
                    options.deviceVersion
                );
            } finally {
                const snapshot = client.getWorkspaceSnapshot().device;
                if (snapshot) applyDeviceSnapshot(dispatch, snapshot);
            }
            return;
        }
        if (!options.operationLockHeld) throw new Error('The upload transaction was not acquired.');

        const audioExportService = await serviceRegistry.audioEncoderManager.getService();
        const uploadService = options.uploadService;
        const netmdFactoryService = options.advancedUploadService;
        if (!uploadService) throw new Error('The standard upload service was not initialized during preflight.');
        if ((usesAtrac1Upload || usesMonoUploadExploit) && !netmdFactoryService) {
            throw new Error('The advanced upload service was not initialized during preflight.');
        }
        if (usesMonoUploadExploit) {
            await netmdFactoryService!.enableMonoUpload(true);
        }

        let screenWakeLock: any = null;
        if ('wakeLock' in navigator) {
            try {
                screenWakeLock = await (navigator as any).wakeLock.request('screen');
            } catch (ex) {
                console.log(ex);
            }
        }

        dispatch(
            batchActions([
                uploadDialogActions.setVisible(true),
                uploadDialogActions.setCancelUpload(false),
                uploadDialogActions.setWriteProgress({ written: 0, encrypted: 0, total: 1 }),
            ])
        );

        const writeTask = options.taskId
            ? serviceRegistry.taskManager.get(options.taskId)
            : serviceRegistry.taskManager.create(
                  'disc.write',
                  `Write ${files.length} track${files.length === 1 ? '' : 's'} to MiniDisc`,
                  files.length,
                  'tracks'
              );
        if (writeTask.status === 'queued') serviceRegistry.taskManager.start(writeTask.id, 'preparing');
        else if (writeTask.status !== 'running') throw new Error(`Write task ${writeTask.id} is no longer active.`);

        let lastUploadProgress = new Date().getTime(),
            lastConvertProgress = lastUploadProgress;
        const originalTitle = document.title;
        let totalBytesAllTracks = 0,
            bytesSentFromPrevTracks = 0,
            bytesSentFromThisTrack = 0;

        const updateUploadProgressCallback = ({ written, encrypted, total }: { written: number; encrypted: number; total: number }) => {
            const now = new Date().getTime();
            if (now - lastUploadProgress > 200) {
                queueMicrotask(() => dispatch(uploadDialogActions.setWriteProgress({ written, encrypted, total })));
                lastUploadProgress = now;
                bytesSentFromThisTrack = written;
                if (isWriteTaskRunning()) {
                    serviceRegistry.taskManager.reportProgress(writeTask.id, {
                        bytesWritten: bytesSentFromPrevTracks + written,
                        bytesTotal: totalBytesAllTracks || bytesSentFromPrevTracks + total,
                    });
                }
                updateTitle();
            }
        };

        // TODO: Make this less jank when there is more than one song being uploaded.
        const updateEncodeProgressCallback = (trackNumber: number, totalTracks: number, object: { state: number; total: number }) => {
            const now = new Date().getTime();
            if (now - lastConvertProgress > 200) {
                queueMicrotask(() =>
                    dispatch(
                        uploadDialogActions.setTrackEncodingProgress({
                            total: totalTracks,
                            state: trackNumber /* starts at 0 */ + object.state / object.total,
                        })
                    )
                );
                lastConvertProgress = now;
                updateTitle();
            }
        };

        const updateTitle = () => {
            if (totalBytesAllTracks === 0) {
                document.title = `Converting | ${originalTitle}`;
                return;
            }

            const percentage = Math.floor((100 * (bytesSentFromThisTrack + bytesSentFromPrevTracks)) / totalBytesAllTracks);
            document.title = `${percentage}% complete | Upload | ${originalTitle}`;
        };

        const hasUploadBeenCancelled = () => {
            const currentTask = serviceRegistry.taskManager.get(writeTask.id);
            return (
                getState().uploadDialog.cancelled ||
                currentTask.cancellationRequested ||
                currentTask.status === 'cancelled' ||
                currentTask.status === 'interrupted'
            );
        };

        const isWriteTaskRunning = () => serviceRegistry.taskManager.get(writeTask.id).status === 'running';

        const releaseScreenLockIfPresent = async () => {
            if (!screenWakeLock) return;
            try {
                await screenWakeLock.release();
            } catch (error) {
                console.error('Could not release the screen wake lock.', error);
            }
        };

        function showFinishedNotificationIfNeeded() {
            const { notifyWhenFinished, hasNotificationSupport } = getState().appState;
            if (!hasNotificationSupport || !notifyWhenFinished) {
                return;
            }
            const notification = new Notification('MiniDisc recording completed', {
                icon: NotificationCompleteIconUrl,
            });
            notification.onclick = function () {
                window.focus();
                this.close();
            };
        }

        const trackUpdate: {
            current: number;
            converting: number;
            total: number;
            titleCurrent: string;
            titleConverting: string;
        } = {
            current: 0,
            converting: 0,
            total: files.length,
            titleCurrent: '',
            titleConverting: '',
        };
        const updateTrack = () => {
            dispatch(
                batchActions([
                    uploadDialogActions.setTrackProgress(trackUpdate),
                    uploadDialogActions.setTrackEncodingProgress({ state: 0, total: 0 }),
                ])
            );
            updateTitle();
        };
        updateTrack();

        const conversionIterator = convertImportAudio(files, format, additionalParameters, audioExportService, {
            isCancelled: hasUploadBeenCancelled,
            onTrackStarted: (index, _total, file) => {
                trackUpdate.converting = index;
                trackUpdate.titleConverting = file.title;
                updateTrack();
            },
            onTrackProgress: updateEncodeProgressCallback,
            onQueueFinished: (totalBytes, startedCount) => {
                trackUpdate.converting = startedCount;
                trackUpdate.titleConverting = '';
                totalBytesAllTracks = totalBytes;
                updateTrack();
            },
        });

        const disc = getState().main.disc;
        const usesHiMDTitles = getState().main.deviceCapabilities.includes(Capability.himdTitles);
        const useFullWidth = getState().appState.fullWidthSupport;

        let error: any;
        let errorMessage = ``;
        let writtenTracks = 0;
        let cancelled = false;
        try {
            const result = await runImportUploadSession({
                tracks: conversionIterator,
            totalTracks: files.length,
            format,
            disc: disc!,
            service: uploadService,
                factoryService: netmdFactoryService ?? undefined,
                usesHiMDTitles,
                useFullWidthTitles: useFullWidth,
                disableMonoUploadOnFinish: usesMonoUploadExploit,
                isCancelled: hasUploadBeenCancelled,
                hooks: {
                    onPhase: (phase) => {
                        if (isWriteTaskRunning() && serviceRegistry.taskManager.get(writeTask.id).phase !== phase) {
                            serviceRegistry.taskManager.setPhase(writeTask.id, phase);
                        }
                    },
                    onTrackStarted: (track) => {
                        trackUpdate.current = track.index + 1;
                        trackUpdate.titleCurrent = track.displayTitle;
                        bytesSentFromPrevTracks += bytesSentFromThisTrack;
                        bytesSentFromThisTrack = 0;
                        updateTrack();
                        if (isWriteTaskRunning()) {
                            serviceRegistry.taskManager.reportProgress(writeTask.id, {
                                completed: track.index,
                                currentLabel: track.displayTitle,
                            });
                        }
                    },
                    onTrackProgress: (_track, progress) => updateUploadProgressCallback(progress),
                    onTrackCompleted: (track) => {
                        if (isWriteTaskRunning()) {
                            serviceRegistry.taskManager.reportProgress(writeTask.id, { completed: track.index + 1 });
                        }
                    },
                },
            });
            writtenTracks = result.writtenTracks;
            cancelled = result.cancelled;
        } catch (caughtError) {
            error = caughtError;
            if (caughtError instanceof ImportUploadSessionError) {
                writtenTracks = caughtError.writtenTracks;
                errorMessage = caughtError.displayMessage;
            } else {
                errorMessage = 'The recording task stopped before all tracks were transferred.';
            }
        } finally {
            document.title = originalTitle;
            let actionToDispatch: UnknownAction[] = [uploadDialogActions.setVisible(false)];
            if (error) {
                console.error(error);
                actionToDispatch = actionToDispatch.concat([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(errorMessage),
                ]);
            }
            dispatch(batchActions(actionToDispatch));

            if (isWriteTaskRunning()) {
                if (error) {
                    serviceRegistry.taskManager.fail(writeTask.id, error, {
                        completedItems: writtenTracks,
                        pendingItems: files.length - writtenTracks,
                        recoveryAction:
                            writtenTracks > 0
                                ? 'Refresh the disc, keep the completed tracks, and retry only the remaining imports.'
                                : 'Check the source audio, encoder, and device connection before retrying the write.',
                        details: { displayMessage: errorMessage },
                    });
                } else if (cancelled || hasUploadBeenCancelled()) {
                    serviceRegistry.taskManager.cancel(writeTask.id, { writtenTracks });
                } else {
                    serviceRegistry.taskManager.succeed(writeTask.id, { writtenTracks });
                    showFinishedNotificationIfNeeded();
                }
            }
            await releaseScreenLockIfPresent();
        }
    };
}

export function openLocalLibrary() {
    return async function (dispatch: AppDispatch) {
        dispatch(localLibraryActions.setVisible(true));
        dispatch(batchActions([localLibraryActions.setDatabase(null), localLibraryActions.setStatus('Loading database...')]));
        const result = await getApplicationClient().execute({ type: 'library.refresh' });
        if (!result.ok) {
            dispatch(localLibraryActions.setStatus(`Could not load library: ${result.error.message}`));
            return;
        }
        dispatch(
            batchActions([
                localLibraryActions.setStatus(null),
                localLibraryActions.setDatabase(result.library?.database ?? null),
            ])
        );
    };
}

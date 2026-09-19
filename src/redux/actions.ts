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
    AdaptiveFile,
} from '../utils';
import { isDeferredFile } from '../application/deferred-file';
import NotificationCompleteIconUrl from '../images/record-complete-notification-icon.png';
import { assertNumber, getHalfWidthTitleLength } from 'netmd-js/dist/utils';
import { Capability, NetMDService, Codec, MinidiscSpec, ExploitCapability } from '../services/interfaces/netmd';
import { getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { AudioServices, resolveAudioServiceIndex } from '../services/audio-export-service-manager';
import { checkFactoryCapability, initializeFactoryMode } from './factory/factory-actions';
import { ExportParams } from '../services/audio/audio-export';
import { LibraryServices } from '../services/library-services';
import { s16LEToSamplesArray, Shazam } from 'shazam-api';
import { bindApplicationRuntime, ensureApplicationCommandBus, getApplicationRuntime, releaseDeviceSession } from '../application/runtime';
import type { DeviceSnapshot } from '../application/contracts';
import { applyDeviceSnapshot } from './application-adapter';
import { MetadataImportError } from '../domain/metadata-import';
import { waitForTrackReady } from '../domain/playback-position';
import { resolveGroupedTrackMove } from '../domain/disc-layout';
import { DeviceSessionConnector } from '../application/device-session';

export function requestTaskCancellation(id: string) {
    return async function () {
        serviceRegistry.taskManager.requestCancellation(id);
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
        switch (action) {
            case 'play':
                await getApplicationRuntime().controlPlayback({ action: 'play' });
                break;
            case 'stop':
                await getApplicationRuntime().controlPlayback({ action: 'stop' });
                break;
            case 'next':
                await getApplicationRuntime().controlPlayback({ action: 'next' });
                break;
            case 'prev':
                await getApplicationRuntime().controlPlayback({ action: 'previous' });
                break;
            case 'pause':
                await getApplicationRuntime().controlPlayback({ action: 'pause' });
                break;
            case 'goto': {
                const trackNumber = assertNumber(params, 'Invalid track number for "goto" command');
                await getApplicationRuntime().controlPlayback({ action: 'gotoTrack', index: trackNumber });
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
                await getApplicationRuntime().controlPlayback({
                    action: 'seek',
                    index: trackNumber,
                    hour: timeArgs[0],
                    minute: timeArgs[1],
                    second: timeArgs[2],
                    frame: timeArgs[3],
                });
                break;
            }
        }
        // CAVEAT: change-track might take a up to a few seconds to complete.
        // We wait 500ms and let the monitor do further updates
        await sleep(500);
        try {
            applyDeviceSnapshot(dispatch, await getApplicationRuntime().refresh());
        } catch (e) {
            console.log('control: Cannot get device status');
        }
    };
}

export function renameGroup({ groupIndex, newName, newFullWidthName }: { groupIndex: number; newName: string; newFullWidthName?: string }) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            const snapshot = await getApplicationRuntime().renameGroup({
                index: groupIndex,
                title: newName,
                fullWidthTitle: newFullWidthName,
            });
            applyDeviceSnapshot(dispatch, snapshot);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function groupTracks(indexes: number[]) {
    return async function (dispatch: AppDispatch) {
        const begin = indexes[0];
        const length = indexes[indexes.length - 1] - begin + 1;
        applyDeviceSnapshot(dispatch, await getApplicationRuntime().createGroup(begin, length));
    };
}

export function deleteGroups(indexes: number[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            applyDeviceSnapshot(dispatch, await getApplicationRuntime().deleteGroups(indexes));
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
            const application = getApplicationRuntime();
            const snapshot = application.readSnapshot() ?? (await application.refresh());
            if (!snapshot.disc) return;
            const move = resolveGroupedTrackMove(snapshot.disc, sourceList, sourceIndex, targetList, targetIndex);
            if (move.sourceIndex === move.destinationIndex) return;
            applyDeviceSnapshot(dispatch, await application.moveTrack(move.sourceIndex, move.destinationIndex, snapshot.revision));
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
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        dispatch(
            batchActions([
                appStateActions.setPairingFailed(false),
                appStateActions.setConnectingInProgress(true),
                appStateActions.setFactoryModeRippingInMainUi(false),
            ])
        );

        try {
            serviceRegistry.mediaSessionService?.init(); // no need to await

            const audioServiceIndex = resolveAudioServiceIndex(getState().appState.audioExportService);
            serviceRegistry.audioExportService = new AudioServices[audioServiceIndex].create(getState().appState.audioExportServiceConfig);
            await serviceRegistry.audioExportService.init();

            const libraryServiceIndex = getState().appState.libraryService;
            if (libraryServiceIndex !== -1) {
                serviceRegistry.libraryService = new LibraryServices[libraryServiceIndex].create(getState().appState.libraryServiceConfig);
            }

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
            dispatch(batchActions([appStateActions.setPairingMessage(`Connection Failed`), appStateActions.setPairingFailed(true)]));
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
            const snapshot: DeviceSnapshot = await getApplicationRuntime().refresh(dropCache);
            applyDeviceSnapshot(dispatch, snapshot);
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function renameTrack(...entries: { index: number; newName: string; newFullWidthName?: string }[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(batchActions([renameDialogActions.setVisible(false), appStateActions.setLoading(true)]));
        try {
            const snapshot = await getApplicationRuntime().renameTracks(
                entries.map(({ index, newName, newFullWidthName }) => ({
                    index,
                    title: newName,
                    fullWidthTitle: newFullWidthName,
                }))
            );
            applyDeviceSnapshot(dispatch, snapshot);
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
            applyDeviceSnapshot(dispatch, await getApplicationRuntime().renameHiMDTracks(entries));
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
        const snapshot = await getApplicationRuntime().renameDisc(
            newName.replace(/\/\//g, ' /'), // Make sure the title doesn't interfere with the groups
            newFullWidthName?.replace(/／／/g, '／')
        );
        applyDeviceSnapshot(dispatch, snapshot);
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
            const snapshot = await getApplicationRuntime().deleteTracks(indexes, {
                confirmed: true,
                reason: 'Confirmed in the MiniDisc Workspace user interface',
            });
            applyDeviceSnapshot(dispatch, snapshot);
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
            const snapshot = await getApplicationRuntime().eraseDisc({
                confirmed: true,
                reason: 'Confirmed in the MiniDisc Workspace user interface',
            });
            applyDeviceSnapshot(dispatch, snapshot);
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
            applyDeviceSnapshot(
                dispatch,
                await getApplicationRuntime().formatToHiMD({
                    confirmed: true,
                    reason: 'Confirmed in the MiniDisc Workspace user interface',
                })
            );
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function ejectDisc() {
    return async function (dispatch: AppDispatch) {
        applyDeviceSnapshot(dispatch, await getApplicationRuntime().ejectDisc());
    };
}

export function moveTrack(srcIndex: number, destIndex: number) {
    return async function (dispatch: AppDispatch) {
        const snapshot = await getApplicationRuntime().moveTrack(srcIndex, destIndex);
        applyDeviceSnapshot(dispatch, snapshot);
    };
}

export function downloadTracks(
    indexes: number[],
    convertOutputToWav: boolean,
    callback?: (blob: Blob, name: string) => void
) {
    return async function (dispatch: AppDispatch): Promise<void> {
        const application = getApplicationRuntime();
        const request = {
            indexes,
            convertToWav: convertOutputToWav,
            expectedRevision: application.readSnapshot()?.revision,
        };
        let task;
        try {
            if (callback) {
                if (!serviceRegistry.trackExporter) throw new Error('Track export is unavailable in this application environment.');
                task = await serviceRegistry.trackExporter.start(
                    request,
                    application,
                    serviceRegistry.taskManager,
                    (data, fileName) => {
                        const copy = new Uint8Array(data.byteLength);
                        copy.set(data);
                        callback(new Blob([copy.buffer], { type: 'application/octet-stream' }), fileName);
                    }
                );
            } else {
                const result = await ensureApplicationCommandBus().execute({ type: 'track.export', ...request });
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

        dispatch(batchActions([recordDialogAction.setVisible(true), recordDialogAction.setTaskId(task.id)]));
        try {
            while (task.status === 'queued' || task.status === 'running') {
                const bytesTotal = task.progress.bytesTotal ?? 0;
                dispatch(
                    recordDialogAction.setProgress({
                        trackTotal: task.progress.total,
                        trackDone: task.progress.completed,
                        trackCurrent: bytesTotal > 0 ? (100 * (task.progress.bytesWritten ?? 0)) / bytesTotal : -1,
                        titleCurrent: task.progress.currentLabel ?? '',
                    })
                );
                await sleep(100);
                task = serviceRegistry.taskManager.get(task.id);
            }
            if (task.status === 'failed') {
                dispatch(
                    batchActions([
                        errorDialogAction.setVisible(true),
                        errorDialogAction.setErrorMessage(task.error?.message ?? 'Track export failed.'),
                    ])
                );
            }
        } finally {
            dispatch(batchActions([recordDialogAction.setVisible(false), recordDialogAction.setTaskId(null)]));
        }
    };
}

export function recordTracks(indexes: number[], deviceId: string, options: { operationLockHeld?: boolean } = {}) {
    return async function (dispatch: AppDispatch, getState: () => RootState): Promise<void> {
        if (!options.operationLockHeld) {
            return serviceRegistry.operationCoordinator.run(() =>
                recordTracks(indexes, deviceId, { operationLockHeld: true })(dispatch, getState)
            );
        }
        const disc = getState().main.disc;
        if (!disc) throw new Error('Insert a disc before recording tracks through the audio input.');
        const requestedIndexes = new Set(indexes);
        if (indexes.length === 0 || requestedIndexes.size !== indexes.length) {
            throw new Error('Select one or more unique tracks before starting an audio-input recording.');
        }
        const tracks = getTracks(disc).filter((track) => requestedIndexes.has(track.index));
        if (tracks.length !== requestedIndexes.size) throw new Error('One or more selected tracks do not exist on the current disc.');

        const task = serviceRegistry.taskManager.create(
            'track.record',
            `Record ${tracks.length} track${tracks.length === 1 ? '' : 's'} through the audio input`,
            tracks.length,
            'tracks'
        );
        serviceRegistry.taskManager.start(task.id, 'preparing');
        dispatch(
            batchActions([
                recordDialogAction.setVisible(true),
                recordDialogAction.setTaskId(task.id),
                recordDialogAction.setProgress({ trackTotal: tracks.length, trackDone: 0, trackCurrent: 0, titleCurrent: '' }),
            ])
        );

        const { netmdService, mediaRecorderService } = serviceRegistry;
        let recordingStarted = false;
        let recordedTracks = 0;
        try {
            await netmdService!.stop();
            for (const [i, track] of tracks.entries()) {
                if (serviceRegistry.taskManager.isCancellationRequested(task.id)) break;
                serviceRegistry.taskManager.setPhase(task.id, 'preparing');
                dispatch(
                    recordDialogAction.setProgress({
                        trackTotal: tracks.length,
                        trackDone: i,
                        trackCurrent: -1,
                        titleCurrent: track.title ?? '',
                    })
                );

                await netmdService!.gotoTrack(track.index);
                await netmdService!.play();
                const readiness = await waitForTrackReady(track.index, () => netmdService!.getPosition(), {
                    isCancelled: () => serviceRegistry.taskManager.isCancellationRequested(task.id),
                });
                if (readiness === 'cancelled') break;
                await netmdService!.pause();
                await netmdService!.gotoTrack(track.index);

                await mediaRecorderService!.initStream(deviceId);
                try {
                    await mediaRecorderService!.startRecording();
                    recordingStarted = true;
                    serviceRegistry.taskManager.setPhase(task.id, 'transferring');
                    await netmdService!.play();
                    const completed = await sleepWithProgressCallback(
                        track.duration * 1000,
                        (percentage: number) => {
                            dispatch(
                                recordDialogAction.setProgress({
                                    trackTotal: tracks.length,
                                    trackDone: i,
                                    trackCurrent: percentage,
                                    titleCurrent: track.title ?? '',
                                })
                            );
                        },
                        () => serviceRegistry.taskManager.isCancellationRequested(task.id)
                    );
                    await mediaRecorderService!.stopRecording();
                    recordingStarted = false;
                    if (!completed) break;

                    let title;
                    if (track.title) {
                        title = `${track.index + 1}. ${track.title}`;
                        if (track.fullWidthTitle) title += ` (${track.fullWidthTitle})`;
                    } else if (track.fullWidthTitle) {
                        title = `${track.index + 1}. ${track.fullWidthTitle}`;
                    } else {
                        title = `Track ${track.index + 1}`;
                    }
                    mediaRecorderService!.downloadRecorded(title);
                    recordedTracks += 1;
                    serviceRegistry.taskManager.reportProgress(task.id, { completed: recordedTracks, currentLabel: title });
                } finally {
                    if (recordingStarted) {
                        await mediaRecorderService!.stopRecording().catch((error) => console.error('Could not stop recording.', error));
                        recordingStarted = false;
                    }
                    await mediaRecorderService!.closeStream();
                }
            }

            if (serviceRegistry.taskManager.isCancellationRequested(task.id)) {
                serviceRegistry.taskManager.cancel(task.id, { recordedTracks });
            } else {
                serviceRegistry.taskManager.succeed(task.id, { recordedTracks });
            }
        } catch (error) {
            serviceRegistry.taskManager.fail(task.id, error, {
                completedItems: recordedTracks,
                pendingItems: tracks.length - recordedTracks,
                recoveryAction:
                    recordedTracks > 0
                        ? 'Keep the downloaded recordings and retry only the remaining tracks.'
                        : 'Check the audio input and device playback connection before retrying.',
            });
            dispatch(
                batchActions([
                    errorDialogAction.setVisible(true),
                    errorDialogAction.setErrorMessage(error instanceof Error ? error.message : 'Audio-input recording failed.'),
                ])
            );
        } finally {
            await netmdService!.stop().catch((error) => console.error('Could not stop the MiniDisc device.', error));
            await mediaRecorderService?.closeStream();
            dispatch(batchActions([recordDialogAction.setVisible(false), recordDialogAction.setTaskId(null)]));
        }
    };
}

export function renameInConvertDialog({ index, newName, newFullWidthName }: { index: number; newName: string; newFullWidthName: string }) {
    return async function () {
        const snapshot = serviceRegistry.importQueue.snapshot();
        const item = snapshot.items[index];
        if (!item) throw new Error(`Import queue item ${index} does not exist.`);
        serviceRegistry.importQueue.update(
            item.id,
            { title: newName, fullWidthTitle: newFullWidthName },
            snapshot.revision
        );
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
        const snapshot = serviceRegistry.importQueue.snapshot();
        const item = snapshot.items[index];
        if (!item) throw new Error(`Import queue item ${index} does not exist.`);
        serviceRegistry.importQueue.update(item.id, { title, artist, album }, snapshot.revision);
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
        const bus = ensureApplicationCommandBus();
        const started = await bus.execute({
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
            task = serviceRegistry.taskManager.get(task.id);
        }
        const refreshed = await bus.execute({ type: 'disc.refresh', dropCache: true });
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
            const exported = await getApplicationRuntime().exportMetadataCsv();
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
            const application = getApplicationRuntime();
            const expectedRevision = application.readSnapshot()?.revision;
            const plan = await application.planMetadataImport(text);
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
            applyDeviceSnapshot(
                dispatch,
                await application.applyMetadataImport(text, [...includedTrackIndexes], expectedRevision)
            );
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
            await serviceRegistry.netmdFactoryService!.prepareDownload(getState().appState.factoryModeUseSlowerExploit);
        }

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

                    const atracData = await serviceRegistry.netmdFactoryService!.exploitDownloadTrack(
                        trackEntry.index,
                        false,
                        (e) =>
                            dispatch(
                                batchActions([
                                    songRecognitionProgressDialogActions.setCurrentStepProgress(e.read),
                                    songRecognitionProgressDialogActions.setCurrentStepTotal(e.total),
                                ])
                            ),
                        {
                            secondsToRead: SECONDS_TO_READ,
                            startSeconds: optimalStartSeconds,
                            writeHeader: true,
                        }
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

                    const { mediaRecorderService, netmdService } = serviceRegistry;
                    await netmdService?.stop();
                    await netmdService?.gotoTrack(track.index);
                    await netmdService?.gotoTime(
                        track.index,
                        Math.floor(optimalStartSeconds / 3600),
                        Math.floor((optimalStartSeconds % 3600) / 60),
                        optimalStartSeconds % 60,
                        0
                    );
                    await netmdService?.play();
                    await mediaRecorderService?.initStream(deviceId);
                    await mediaRecorderService?.startRecording();
                    await sleepWithProgressCallback(SECONDS_TO_READ * 1000, (perc: number) => {
                        dispatch(songRecognitionProgressDialogActions.setCurrentStepProgress(perc));
                    });
                    await mediaRecorderService?.stopRecording();
                    await netmdService?.stop();
                    dispatch(
                        batchActions([
                            songRecognitionProgressDialogActions.setCurrentStepProgress(-1),
                            songRecognitionProgressDialogActions.setCurrentStepTotal(0),
                            songRecognitionProgressDialogActions.setCurrentStep(1),
                        ])
                    );
                    const rawWav = await new Promise<Uint8Array>((res) =>
                        mediaRecorderService!.recorder.exportWAV(async (blob: Blob) => res(new Uint8Array(await blob.arrayBuffer())))
                    );
                    rawSamples = await ffmpegTranscode(rawWav, 'wav', '-ar 16000 -ac 1 -f s16le');
                    await mediaRecorderService?.closeStream();
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
        if (mode === 'exploits') await serviceRegistry.netmdFactoryService!.finalizeDownload();
        dispatch(
            batchActions([songRecognitionDialogActions.setTitles(trackEntries), songRecognitionProgressDialogActions.setVisible(false)])
        );
    };
}

export function flushDevice() {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            applyDeviceSnapshot(dispatch, await getApplicationRuntime().flush());
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function convertAndUpload(
    files: TitledFile[],
    format: Codec,
    additionalParameters: { enableReplayGain: boolean; enableGapless: boolean },
    options: { taskId?: string; operationLockHeld?: boolean } = {}
) {
    return async function (dispatch: AppDispatch, getState: () => RootState): Promise<void> {
        if (!options.operationLockHeld) {
            return serviceRegistry.operationCoordinator.run(() =>
                convertAndUpload(files, format, additionalParameters, { ...options, operationLockHeld: true })(dispatch, getState)
            );
        }
        const deviceCapabilities = getState().main.deviceCapabilities;
        if (files.some((e) => e.forcedEncoding?.codec === 'SPS' || e.forcedEncoding?.codec === 'SPM')) {
            const removeSPFiles = () =>
                (files = files.filter((e) => e.forcedEncoding?.codec !== 'SPS' && e.forcedEncoding?.codec !== 'SPM'));
            if (!deviceCapabilities.includes(Capability.factoryMode)) {
                window.alert('Sorry! Your device cannot enter the factory mode. SP upload is not possible');
                removeSPFiles();
            } else if (
                !window.confirm(
                    "To upload ATRAC1 files back onto the MD, you're required to enter the homebrew mode.\nDo you want to continue?"
                )
            ) {
                window.alert("SP Files won't be transferred");
                removeSPFiles();
            } else if (!(await checkFactoryCapability(dispatch, ExploitCapability.uploadAtrac1))) {
                window.alert("Sorry! Your device doesn't support the SP upload exploit.");
                removeSPFiles();
            }
        }
        if (files.length === 0) return;

        const { audioExportService, netmdService, netmdSpec } = serviceRegistry;
        let { netmdFactoryService } = serviceRegistry;
        const usesMonoUploadExploit = format.codec === 'SPM' && !deviceCapabilities.includes(Capability.nativeMonoUpload);
        if (usesMonoUploadExploit) {
            // SP MONO is a homebrew feature
            if (!deviceCapabilities.includes(Capability.factoryMode)) {
                window.alert('Sorry! Your device cannot enter the factory mode. SP MONO upload is not possible');
                dispatch(convertDialogActions.setVisible(true));
                return;
            } else if (
                !window.confirm(
                    "To upload MONO ATRAC files onto the MD, you're required to enter the homebrew mode.\nDo you want to continue?"
                )
            ) {
                window.alert('Transfer cancelled');
                dispatch(convertDialogActions.setVisible(true));
                return;
            } else if (!(await checkFactoryCapability(dispatch, ExploitCapability.uploadMonoSP))) {
                window.alert("Sorry! Your device doesn't support the SP MONO upload exploit.");
                dispatch(convertDialogActions.setVisible(true));
                return;
            }

            // Reload the factory service from registry
            await initializeFactoryMode()(dispatch);
            netmdFactoryService = serviceRegistry.netmdFactoryService;

            // All good - load the exploit
            await netmdFactoryService!.enableMonoUpload(true);
        }

        console.log(await netmdService?.getDeviceStatus());

        let screenWakeLock: any = null;
        if ('wakeLock' in navigator) {
            try {
                screenWakeLock = await (navigator as any).wakeLock.request('screen');
            } catch (ex) {
                console.log(ex);
            }
        }

        await netmdService?.stop();
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
            totalBytesCalc = 0,
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

        const conversionIterator = async function* (files: TitledFile[]) {
            const converted: Promise<{ file: TitledFile; data: ArrayBuffer }>[] = [];

            let i = 0;
            function convertNext() {
                if (i === files.length || hasUploadBeenCancelled()) {
                    trackUpdate.converting = i;
                    trackUpdate.titleConverting = ``;
                    totalBytesAllTracks = totalBytesCalc;
                    updateTrack();
                    return;
                }

                const f = files[i];
                trackUpdate.converting = i;
                trackUpdate.titleConverting = f.title;
                const j = i;
                updateTrack();
                i++;

                if (f.forcedEncoding === null) {
                    // This is not an ATRAC file
                    converted[j] = (async () => {
                        try {
                            let audioExportFormat: ExportParams['format'];
                            switch (format.codec) {
                                case 'SPS':
                                case 'SPM':
                                    audioExportFormat = {
                                        codec: 'PCM',
                                        bitrate: 1411,
                                    };
                                    break;
                                default:
                                    audioExportFormat = {
                                        codec: format.codec,
                                        bitrate: format.bitrate,
                                    };
                                    break;
                            }

                            const exportParams: ExportParams = {
                                format: audioExportFormat,
                                enableReplayGain: additionalParameters.enableReplayGain,
                                writeGapless: additionalParameters.enableGapless && j !== files.length - 1,
                            };

                            const inputFile = isDeferredFile(f.file) ? await f.file.getFile() : f.file;
                            let data: ArrayBuffer;
                            if ((inputFile as any).getForEncoding) {
                                const file = inputFile as AdaptiveFile;
                                data = await file.getForEncoding(exportParams);
                            } else {
                                const file = inputFile as File;
                                await audioExportService!.prepare(file);
                                data = await audioExportService!.export(
                                    exportParams,
                                    updateEncodeProgressCallback.bind(null, j, files.length)
                                );
                            }

                            totalBytesCalc += data.byteLength;
                            convertNext();
                            return { file: f, data };
                        } catch (err) {
                            error = err;
                            errorMessage = `${f.file.name}: Unsupported or unrecognized format`;
                            throw err;
                        }
                    })();
                } else {
                    // This is already an ATRAC file - don't reencode.
                    converted[j] = (async () => {
                        try {
                            const inputFile = isDeferredFile(f.file) ? await f.file.getFile() : f.file;
                            if ((inputFile as any).getForEncoding) throw new Error('Adaptive files cannot be preencoded!');
                            // Remove the WAV header.
                            const file = inputFile as File;
                            const data = (await file.arrayBuffer()).slice(f.bytesToSkip);
                            totalBytesCalc += data.byteLength;
                            convertNext();
                            return { file: f, data };
                        } catch (err) {
                            error = err;
                            errorMessage = `${f.file.name}: Could not read the pre-encoded track`;
                            throw err;
                        }
                    })();
                }
            }
            convertNext();

            let j = 0;
            while (j < converted.length) {
                yield await converted[j];
                delete converted[j];
                j++;
            }
        };

        const disc = getState().main.disc;
        const usesHiMDTitles = getState().main.deviceCapabilities.includes(Capability.himdTitles);
        const useFullWidth = getState().appState.fullWidthSupport;
        let { halfWidth: availableHalfWidthCharacters, fullWidth: availableFullWidthCharacters } =
            netmdSpec!.getRemainingCharactersForTitles(disc!);

        let error: any;
        let errorMessage = ``;
        let i = 1;
        let writtenTracks = 0;
        let uploadPrepared = false;
        try {
            await netmdService?.prepareUpload();
            uploadPrepared = true;
            if (isWriteTaskRunning()) serviceRegistry.taskManager.setPhase(writeTask.id, 'converting');

            for await (const item of conversionIterator(files)) {
                if (hasUploadBeenCancelled()) {
                    break;
                }

                const { file, data } = item;

                if (isWriteTaskRunning() && serviceRegistry.taskManager.get(writeTask.id).phase !== 'transferring') {
                    serviceRegistry.taskManager.setPhase(writeTask.id, 'transferring');
                }

                const title = file.title;

                const fixLength = (l: number) => Math.max(Math.ceil(l / 7) * 7, 7);
                const halfWidthTitle = title.substring(0, Math.min(getHalfWidthTitleLength(title), availableHalfWidthCharacters));
                availableHalfWidthCharacters -= fixLength(getHalfWidthTitleLength(halfWidthTitle));

                let fullWidthTitle = file.fullWidthTitle;
                if (useFullWidth) {
                    fullWidthTitle = fullWidthTitle.substring(
                        0,
                        Math.min(fullWidthTitle.length * 2, availableFullWidthCharacters, 210 /* limit is 105 */) / 2
                    );
                    availableFullWidthCharacters -= fixLength(fullWidthTitle.length * 2);
                }

                trackUpdate.current = i++;
                trackUpdate.titleCurrent = halfWidthTitle;
                if (fullWidthTitle) {
                    if (trackUpdate.titleCurrent) {
                        trackUpdate.titleCurrent += ' / ';
                    }
                    trackUpdate.titleCurrent += fullWidthTitle;
                }
                bytesSentFromPrevTracks += bytesSentFromThisTrack;
                bytesSentFromThisTrack = 0;
                updateTrack();
                if (isWriteTaskRunning()) {
                    serviceRegistry.taskManager.reportProgress(writeTask.id, {
                        completed: writtenTracks,
                        currentLabel: trackUpdate.titleCurrent,
                    });
                }
                updateUploadProgressCallback({ written: 0, encrypted: 0, total: 100 });
                if (file.forcedEncoding?.codec === 'SPS' || file.forcedEncoding?.codec === 'SPM') {
                    // Uploading an AEA file.
                    await netmdFactoryService!.uploadSP(
                        halfWidthTitle,
                        fullWidthTitle,
                        file.forcedEncoding.codec === 'SPM',
                        data,
                        updateUploadProgressCallback
                    );
                } else {
                    // SPS / SPM was filtered out before
                    const formatOverride: Codec = (file.forcedEncoding as Codec | null) ?? format;
                    await netmdService?.upload(
                        usesHiMDTitles ? { title, artist: file.artist, album: file.album } : halfWidthTitle,
                        fullWidthTitle,
                        data,
                        formatOverride,
                        updateUploadProgressCallback
                    );
                }
                writtenTracks += 1;
                if (isWriteTaskRunning()) {
                    serviceRegistry.taskManager.reportProgress(writeTask.id, { completed: writtenTracks });
                }
            }
        } catch (caughtError) {
            if (!error) {
                error = caughtError;
                errorMessage = 'The recording task stopped before all tracks were transferred.';
            }
        } finally {
            if (isWriteTaskRunning()) {
                serviceRegistry.taskManager.setPhase(writeTask.id, 'finalizing');
            }
            if (uploadPrepared) {
                try {
                    await netmdService?.finalizeUpload();
                } catch (finalizeError) {
                    console.error('Could not finalize the upload session.', finalizeError);
                    if (!error) {
                        error = finalizeError;
                        errorMessage = 'Tracks were transferred, but the device upload session could not be finalized.';
                    }
                }
            }

            if (usesMonoUploadExploit) {
                try {
                    await netmdFactoryService?.enableMonoUpload(false);
                } catch (monoCleanupError) {
                    console.error('Could not disable the mono upload mode.', monoCleanupError);
                    if (!error) {
                        error = monoCleanupError;
                        errorMessage = 'The device did not leave mono upload mode cleanly.';
                    }
                }
            }

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
                } else if (hasUploadBeenCancelled()) {
                    serviceRegistry.taskManager.cancel(writeTask.id, { writtenTracks });
                } else {
                    serviceRegistry.taskManager.succeed(writeTask.id, { writtenTracks });
                    showFinishedNotificationIfNeeded();
                }
            }
            await releaseScreenLockIfPresent();
            await listContent()(dispatch);
        }
    };
}

export function openLocalLibrary() {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        if (!serviceRegistry.libraryService) {
            throw new Error('No library service has been registered!');
        }

        dispatch(localLibraryActions.setVisible(true));
        if (!getState().localLibrary.database) {
            dispatch(localLibraryActions.setStatus('Loading database...'));
            const database = await serviceRegistry.libraryService!.getDatabase();
            dispatch(batchActions([localLibraryActions.setStatus(null), localLibraryActions.setDatabase(database)]));
        }
    };
}

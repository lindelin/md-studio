import { batchActions } from '../frontend-utils';
import { AppDispatch, RootState } from './store';
import { actions as localLibraryActions } from './local-library-feature';
import { actions as renameDialogActions } from './rename-dialog-feature';
import { actions as errorDialogAction } from './error-dialog-feature';
import { actions as recordDialogAction } from './record-dialog-feature';
import { actions as appStateActions } from './app-feature';
import { actions as songRecognitionDialogActions, TitleEntry } from './song-recognition-dialog-feature';
import { actions as songRecognitionProgressDialogActions } from './song-recognition-progress-dialog-feature';
import {
    sleep,
    askNotificationPermission,
    timeToSeekArgs,
    downloadBlob,
    secondsToHumanReadable,
    getTracks,
} from '../utils';
import { assertNumber } from 'netmd-js/dist/utils';
import { getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { getApplicationClient, getTrackRecognizer } from '../application/runtime';
import { MetadataImportError } from '../domain/metadata-import';
import { resolveGroupedTrackMove } from '../domain/disc-layout';
import type { TaskSnapshot } from '../application/task-manager';
import type { ApplicationCommand } from '../application/command-bus';
import type { PlaybackCommand } from '../application/contracts';
import type { TrackRecognitionProgress } from '../application/browser-track-recognizer';

async function executeDeviceCommand(command: ApplicationCommand) {
    const result = await getApplicationClient().execute(command);
    if (!result.ok) throw new Error(result.error.message);
    if (!result.snapshot) throw new Error(`Command ${command.type} did not return the device state.`);
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
        await getApplicationClient().disconnectLocalDevice(finalize);
        dispatch(appStateActions.setMainView('WELCOME'));
    };
}

export function control(action: 'play' | 'stop' | 'next' | 'prev' | 'goto' | 'pause' | 'seek', params?: unknown) {
    return async function () {
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
        await executeDeviceCommand({ type: 'playback.control', command });
        // CAVEAT: change-track might take a up to a few seconds to complete.
        // We wait 500ms and let the monitor do further updates
        await sleep(500);
        try {
            await executeDeviceCommand({ type: 'disc.refresh' });
        } catch (e) {
            console.log('control: Cannot get device status');
        }
    };
}

export function renameGroup({ groupIndex, newName, newFullWidthName }: { groupIndex: number; newName: string; newFullWidthName?: string }) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand({
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
    return async function () {
        const begin = indexes[0];
        const length = indexes[indexes.length - 1] - begin + 1;
        await executeDeviceCommand({
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
            await executeDeviceCommand({
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
                client.getWorkspaceSnapshot().device ?? (await executeDeviceCommand({ type: 'disc.refresh' }));
            if (!snapshot.disc) return;
            const move = resolveGroupedTrackMove(snapshot.disc, sourceList, sourceIndex, targetList, targetIndex);
            if (move.sourceIndex === move.destinationIndex) return;
            await executeDeviceCommand({
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

export function listContent(dropCache: boolean = false) {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand({ type: 'disc.refresh', dropCache });
        } finally {
            dispatch(appStateActions.setLoading(false));
        }
    };
}

export function renameTrack(...entries: { index: number; newName: string; newFullWidthName?: string }[]) {
    return async function (dispatch: AppDispatch) {
        dispatch(batchActions([renameDialogActions.setVisible(false), appStateActions.setLoading(true)]));
        try {
            await executeDeviceCommand({
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
            await executeDeviceCommand({
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
        await executeDeviceCommand({
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
            await executeDeviceCommand({
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
            await executeDeviceCommand({
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
            await executeDeviceCommand({
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
    return async function () {
        await executeDeviceCommand({ type: 'disc.eject', expectedRevision: currentDeviceRevision() });
    };
}

export function moveTrack(srcIndex: number, destIndex: number) {
    return async function () {
        await executeDeviceCommand({
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
        if (!refreshed.ok) throw new Error(refreshed.error.message);
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
                const update = await getApplicationClient().execute({
                    type: 'settings.update',
                    changes: { notifyWhenFinished: false },
                });
                if (!update.ok) throw new Error(update.error.message);
                return;
            }
        }
        const update = await getApplicationClient().execute({
            type: 'settings.update',
            changes: { notifyWhenFinished: value },
        });
        if (!update.ok) throw new Error(update.error.message);
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
    return async function (dispatch: AppDispatch) {
        const device = getApplicationClient().getWorkspaceSnapshot().device;
        if (!device?.disc) return;
        if (!device.capabilities.includes('advanced.factory')) {
            dispatch(songRecognitionDialogActions.setImportMethod('line-in'));
        }

        dispatch(
            batchActions([
                songRecognitionDialogActions.setTitles(
                    getTracks(device.disc)
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
        const toRecognize = trackEntries.filter((n) => n.selectedToRecognize && !n.alreadyRecognized);
        dispatch(
            batchActions([
                songRecognitionProgressDialogActions.setCancelled(false),
                songRecognitionProgressDialogActions.setVisible(true),
                songRecognitionProgressDialogActions.setCurrentTrack(0),
                songRecognitionProgressDialogActions.setTotalTracks(toRecognize.length),
            ])
        );
        const disc = getApplicationClient().getWorkspaceSnapshot().device?.disc;
        if (!disc) throw new Error('No MiniDisc is loaded.');
        const tracks = new Map(getTracks(disc).map((track) => [track.index, track]));
        const publishProgress = (progress: TrackRecognitionProgress) => {
            switch (progress.type) {
                case 'track':
                    dispatch(songRecognitionProgressDialogActions.setCurrentTrack(progress.current));
                    break;
                case 'phase':
                    dispatch(
                        songRecognitionProgressDialogActions.setCurrentStep(
                            progress.phase === 'reading' ? 0 : progress.phase === 'calculating' ? 1 : 2
                        )
                    );
                    if (progress.phase !== 'reading') {
                        dispatch(
                            batchActions([
                                songRecognitionProgressDialogActions.setCurrentStepProgress(-1),
                                songRecognitionProgressDialogActions.setCurrentStepTotal(0),
                            ])
                        );
                    }
                    break;
                case 'read':
                    dispatch(
                        batchActions([
                            songRecognitionProgressDialogActions.setCurrentStepProgress(progress.current),
                            songRecognitionProgressDialogActions.setCurrentStepTotal(progress.total),
                        ])
                    );
                    break;
            }
        };

        try {
            const results = await getTrackRecognizer().recognize(
                {
                    mode,
                    deviceId: inputModeConfiguration?.deviceId,
                    useSlowerExploit:
                        getApplicationClient().getWorkspaceSnapshot().settings.values.factoryModeUseSlowerExploit,
                    tracks: trackEntries.map((entry) => ({
                        index: entry.index,
                        duration: tracks.get(entry.index)?.duration ?? 0,
                        selected: entry.selectedToRecognize,
                        alreadyRecognized: entry.alreadyRecognized,
                    })),
                },
                {
                    isCancelled: () => getState().songRecognitionProgressDialog.cancelled,
                    onProgress: publishProgress,
                }
            );
            const byIndex = new Map(results.map((result) => [result.index, result]));
            const updatedEntries = trackEntries.map((entry) => {
                const result = byIndex.get(entry.index);
                if (!result) return entry;
                if (!result.recognized) return { ...entry, recognizeFail: true };
                return {
                    ...entry,
                    alreadyRecognized: true,
                    recognizeFail: false,
                    songTitle: result.title!,
                    songArtist: result.artist!,
                    songAlbum: result.album ?? 'Unknown',
                };
            });
            dispatch(songRecognitionDialogActions.setTitles(updatedEntries));
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Song recognition failed.');
        } finally {
            dispatch(songRecognitionProgressDialogActions.setVisible(false));
        }
    };
}

export function flushDevice() {
    return async function (dispatch: AppDispatch) {
        dispatch(appStateActions.setLoading(true));
        try {
            await executeDeviceCommand({ type: 'device.flush', expectedRevision: currentDeviceRevision() });
        } finally {
            dispatch(appStateActions.setLoading(false));
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

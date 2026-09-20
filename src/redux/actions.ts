import { batchActions } from '../frontend-utils';
import { getApplicationClient } from '../application/runtime';
import { waitForApplicationTask } from '../application/application-client';
import { downloadBlob } from '../utils';
import { getSimpleServices, type ServiceConstructionInfo } from '../services/interface-service-manager';
import { usesLegacyTaskPresentation } from '../frontend/task-presentation';
import type { TaskSnapshot } from '../application/task-manager';
import type { AppDispatch, RootState } from './store';
import { actions as errorDialogActions } from './error-dialog-feature';
import { actions as appStateActions } from './app-feature';

function currentDeviceRevision() {
    return getApplicationClient().getWorkspaceSnapshot().device?.revision;
}

function shouldReportTaskFailure(getState: () => RootState) {
    return usesLegacyTaskPresentation(getState().appState.mainView);
}

export function disconnectDevice(finalize = true) {
    return async function (dispatch: AppDispatch) {
        await getApplicationClient().disconnectLocalDevice(finalize);
        dispatch(appStateActions.setMainView('WELCOME'));
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

async function waitForTaskResult(dispatch: AppDispatch, initialTask: TaskSnapshot, fallbackError: string, reportFailure = true) {
    const task = await waitForApplicationTask(getApplicationClient(), initialTask.id);
    if (reportFailure && task.status === 'failed') {
        dispatch(
            batchActions([
                errorDialogActions.setVisible(true),
                errorDialogActions.setErrorMessage(task.error?.message ?? fallbackError),
            ])
        );
    }
    return task;
}

export function downloadTracks(indexes: number[], convertOutputToWav: boolean, callback?: (blob: Blob, name: string) => void) {
    return async function (dispatch: AppDispatch, getState: () => RootState): Promise<void> {
        const request = {
            indexes,
            convertToWav: convertOutputToWav,
            expectedRevision: currentDeviceRevision(),
        };
        let task;
        try {
            if (callback) {
                task = await getApplicationClient().startLocalTrackExport(request, (data, fileName) => {
                    const copy = new Uint8Array(data.byteLength);
                    copy.set(data);
                    callback(new Blob([copy.buffer], { type: 'application/octet-stream' }), fileName);
                });
            } else {
                const result = await getApplicationClient().execute({ type: 'track.export', ...request });
                if (!result.ok) throw new Error(result.error.message);
                task = result.task;
            }
        } catch (error) {
            dispatch(
                batchActions([
                    errorDialogActions.setVisible(true),
                    errorDialogActions.setErrorMessage(
                        error instanceof Error ? error.message : 'Track export could not be started.'
                    ),
                ])
            );
            return;
        }
        if (!task) return;
        await waitForTaskResult(dispatch, task, 'Track export failed.', shouldReportTaskFailure(getState));
    };
}

export function exportCSV(callback: (blob: Blob, name: string) => void = downloadBlob) {
    return async function (dispatch: AppDispatch, _getState?: () => RootState) {
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

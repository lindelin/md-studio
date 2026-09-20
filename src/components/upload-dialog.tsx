import React, { useCallback } from 'react';
import { batchActions, useDispatch, useShallowEqualSelector } from '../frontend-utils';
import { actions as errorDialogActions } from '../redux/error-dialog-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { makeStyles } from 'tss-react/mui';
import { setNotifyWhenFinished } from '../redux/actions';
import { useApplicationClient, useApplicationSettings, useApplicationWorkspace } from './use-application-client';
import {
    canRequestTaskCancellation,
    getTaskCancellationPresentation,
} from '../application/task-cancellation-policy';

const useStyles = makeStyles()((theme) => ({
    progressPerc: {
        marginTop: theme.spacing(1),
    },
    progressBar: {
        marginTop: theme.spacing(3),
    },
    uploadLabel: {
        marginTop: theme.spacing(3),
    },
    spacer: {
        flex: '1 1 auto',
    },
    checkBox: {
        marginLeft: 0,
    },
}));

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const UploadDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const applicationClient = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const task = [...workspace.tasks]
        .reverse()
        .find((candidate) => candidate.kind === 'disc.write' && (candidate.status === 'queued' || candidate.status === 'running'));
    const conversion = task?.progress.stages?.conversion;
    const transfer = task?.progress.stages?.transfer;
    const visible = Boolean(task);
    const cancelled = task?.cancellationRequested ?? false;
    const canCancel = task ? canRequestTaskCancellation(task) : false;
    const cancellationPresentation = task ? getTaskCancellationPresentation(task) : undefined;
    const cancelLabel = cancellationPresentation?.actionLabel ?? 'Cancel before recording starts';
    const writeSafetyNotice = cancellationPresentation?.safetyNotice;
    const writtenProgress = transfer?.completed ?? 0;
    const encryptedProgress = transfer?.buffered ?? writtenProgress;
    const totalProgress = transfer?.total ?? 1;
    const trackTotal = task?.progress.total ?? 1;
    const trackCurrent = transfer?.currentLabel ? Math.min(trackTotal, (task?.progress.completed ?? 0) + 1) : 0;
    const trackConverting = conversion?.completed ?? 0;
    const titleCurrent = transfer?.currentLabel ?? '';
    const titleConverting = conversion?.currentLabel ?? '';
    const { hasNotificationSupport } = useShallowEqualSelector((state) => state.appState);
    const { notifyWhenFinished } = useApplicationSettings();

    const handleCancelUpload = useCallback(() => {
        if (!task) return;
        void applicationClient.execute({ type: 'task.cancel', id: task.id }).then((result) => {
            if (result.ok) return;
            dispatch(batchActions([errorDialogActions.setVisible(true), errorDialogActions.setErrorMessage(result.error.message)]));
        });
    }, [applicationClient, dispatch, task]);

    const handleNotifyWhenFinishedChanged = useCallback(() => {
        dispatch(setNotifyWhenFinished(!notifyWhenFinished));
    }, [dispatch, notifyWhenFinished]);

    const progressValue = Math.floor((writtenProgress / totalProgress) * 100);
    const bufferValue = Math.floor((encryptedProgress / totalProgress) * 100);
    const convertedValue = Math.floor((trackConverting / trackTotal) * 100);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="alert-dialog-slide-title"
            aria-describedby="alert-dialog-slide-description"
        >
            <DialogTitle id="alert-dialog-slide-title">Recording...</DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-slide-description">
                    {convertedValue === 100 && trackConverting >= trackTotal
                        ? `Conversion completed`
                        : `Converting ${Math.min(trackTotal, Math.floor(trackConverting) + 1)} of ${trackTotal}: ${titleConverting}`}
                </DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant={convertedValue === 0 ? 'indeterminate' : 'determinate'}
                    color="primary"
                    value={convertedValue}
                />
                <Box className={classes.progressPerc}>{convertedValue}%</Box>

                <DialogContentText id="alert-dialog-slide-description" className={classes.uploadLabel}>
                    Uploading {trackCurrent} of {trackTotal}: {titleCurrent}
                </DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant="buffer"
                    color="secondary"
                    value={progressValue}
                    valueBuffer={bufferValue}
                />
                <Box className={classes.progressPerc}>{progressValue}%</Box>
                {writeSafetyNotice ? (
                    <DialogContentText className={classes.uploadLabel} role="status">
                        {writeSafetyNotice}
                    </DialogContentText>
                ) : null}
            </DialogContent>
            <DialogActions>
                {hasNotificationSupport ? (
                    <FormControlLabel
                        className={classes.checkBox}
                        disabled={!hasNotificationSupport}
                        control={<Checkbox checked={notifyWhenFinished} onChange={handleNotifyWhenFinishedChanged} name="notifyOnEnd" />}
                        label="Notify when completed"
                    />
                ) : null}
                <div className={classes.spacer}></div>
                {canCancel || cancelled ? (
                    <Button disabled={cancelled} onClick={handleCancelUpload}>
                        {cancelLabel}
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    );
};

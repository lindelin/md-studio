import React from 'react';
import { batchActions, useDispatch } from '../frontend-utils';
import { actions as errorDialogActions } from '../redux/error-dialog-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { makeStyles } from 'tss-react/mui';
import { useApplicationClient, useApplicationWorkspace } from './use-application-client';

const useStyles = makeStyles()((theme) => ({
    progressPerc: {
        marginTop: theme.spacing(1),
    },
    progressBar: {
        marginTop: theme.spacing(3),
    },
}));

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const RecordDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const applicationClient = useApplicationClient();
    const task = [...useApplicationWorkspace().tasks]
        .reverse()
        .find(
            (candidate) =>
                ['track.export', 'track.record', 'diagnostics.selfTest'].includes(candidate.kind) &&
                (candidate.status === 'queued' || candidate.status === 'running')
        );
    const visible = Boolean(task);
    const taskId = task?.id;
    const trackTotal = task?.progress.total ?? 1;
    const trackDone = task?.progress.completed ?? 0;
    const bytesTotal = task?.progress.bytesTotal ?? 0;
    const trackCurrent =
        task?.progress.currentPercent ??
        (bytesTotal > 0 ? (100 * (task?.progress.bytesWritten ?? 0)) / bytesTotal : trackTotal > 0 ? (100 * trackDone) / trackTotal : -1);
    const currentLabel = task?.progress.currentLabel ?? task?.phase ?? '';
    const titleCurrent = task?.kind === 'diagnostics.selfTest' ? `Self-Test: ${currentLabel}` : currentLabel;
    const dialogTitle =
        task?.kind === 'diagnostics.selfTest' ? 'Device self-test' : task?.kind === 'track.export' ? 'Exporting...' : 'Recording...';
    const itemLabel = task?.kind === 'diagnostics.selfTest' ? 'step' : 'track';
    const actionLabel = task?.kind === 'track.export' ? 'Exporting' : task?.kind === 'diagnostics.selfTest' ? 'Running' : 'Recording';
    const statusText = `${actionLabel} ${itemLabel} ${Math.min(trackTotal, trackDone + 1)} of ${trackTotal}: ${titleCurrent}`;
    const cancelled = task?.cancellationRequested ?? false;

    const progressValue = Math.round(trackCurrent);
    const handleCancel = taskId
        ? () => {
              void applicationClient.execute({ type: 'task.cancel', id: taskId }).then((result) => {
                  if (result.ok) return;
                  dispatch(batchActions([errorDialogActions.setVisible(true), errorDialogActions.setErrorMessage(result.error.message)]));
              });
          }
        : undefined;

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="record-dialog-slide-title"
            aria-describedby="record-dialog-slide-description"
        >
            <DialogTitle id="record-dialog-slide-title">{dialogTitle}</DialogTitle>
            <DialogContent>
                <DialogContentText id="record-dialog-slide-description">{statusText}</DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant={trackCurrent >= 0 ? 'determinate' : 'indeterminate'}
                    color="primary"
                    value={progressValue}
                />
                <Box className={classes.progressPerc}>{progressValue >= 0 ? `${progressValue}%` : ``}</Box>
            </DialogContent>
            <DialogActions>
                {handleCancel ? (
                    <Button disabled={cancelled} onClick={handleCancel}>
                        {cancelled ? 'Stopping after current step...' : 'Cancel after current step'}
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    );
};

import React, { useCallback } from 'react';
import { batchActions, useDispatch } from '../../frontend-utils';
import { actions as errorDialogActions } from '../../redux/error-dialog-feature';
import { useApplicationClient, useApplicationWorkspace } from '../../frontend/use-application-client';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import { makeStyles } from 'tss-react/mui';

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

export const FactoryModeProgressDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const applicationClient = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const task = workspace.tasks.find(
        (candidate) =>
            (candidate.kind === 'advanced.memory-export' || candidate.kind === 'advanced.track-export') &&
            (candidate.status === 'queued' || candidate.status === 'running')
    );

    const visible = Boolean(task);
    const actionName = task?.label ?? '';
    const units = task?.progress.unit ?? '';
    const currentProgress = task?.progress.bytesWritten ?? task?.progress.completed ?? 0;
    const totalProgress = task?.progress.bytesTotal ?? task?.progress.total ?? 0;
    const additionalInfo = task?.progress.currentLabel ?? '';
    const canBeCancelled = task?.kind === 'advanced.track-export';
    const cancelled = task?.cancellationRequested ?? false;

    const handleCancel = useCallback(async () => {
        if (!task) return;
        const result = await applicationClient.execute({ type: 'task.cancel', id: task.id });
        if (!result.ok) {
            dispatch(batchActions([errorDialogActions.setErrorMessage(result.error.message), errorDialogActions.setVisible(true)]));
        }
    }, [applicationClient, dispatch, task]);

    const progressValue = Math.round((100 / (totalProgress || 1)) * currentProgress);
    const hasDeterminateProgress = currentProgress >= 0 && totalProgress > 0;

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="factory-dialog-slide-title"
            aria-describedby="factory-dialog-slide-description"
        >
            <DialogTitle id="factory-dialog-slide-title">{actionName}...</DialogTitle>
            <DialogContent>
                <DialogContentText id="factory-dialog-slide-description">
                    {hasDeterminateProgress
                        ? `${currentProgress} ${units} of ${totalProgress} done ${additionalInfo && `(${additionalInfo})`}`
                        : additionalInfo}
                </DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant={hasDeterminateProgress ? 'determinate' : 'indeterminate'}
                    color="primary"
                    value={progressValue}
                />
                <Box className={classes.progressPerc}>{hasDeterminateProgress ? `${progressValue}%` : ``}</Box>
            </DialogContent>
            <DialogActions>
                {canBeCancelled && (
                    <Button disabled={cancelled} onClick={handleCancel}>
                        {cancelled ? `Finalizing...` : `Cancel`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

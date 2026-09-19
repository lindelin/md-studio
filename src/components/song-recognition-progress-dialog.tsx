import React, { useCallback } from 'react';
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
import Step from '@mui/material/Step';
import Stepper from '@mui/material/Stepper';
import StepLabel from '@mui/material/StepLabel';
import Typography from '@mui/material/Typography';
import { makeStyles } from 'tss-react/mui';
import { useApplicationClient, useApplicationWorkspace } from './use-application-client';

const useStyles = makeStyles()((theme) => ({
    progressPerc: {
        marginTop: theme.spacing(1),
    },
    progressBar: {
        marginTop: theme.spacing(3),
    },
    label: {
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

export const SongRecognitionProgressDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const applicationClient = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const task = [...workspace.tasks]
        .reverse()
        .find((candidate) => candidate.kind === 'metadata.recognize' && (candidate.status === 'queued' || candidate.status === 'running'));
    const stage = task?.progress.stages?.recognition;
    const phase = stage?.currentLabel;
    const currentStep = phase === 'calculating' ? 1 : phase === 'identifying' ? 2 : 0;
    const currentTrack = task?.progress.completed ?? 0;
    const totalTracks = task?.progress.total ?? 0;
    const visible = Boolean(task);
    const cancelled = task?.cancellationRequested ?? false;
    const currentStepCurrent = stage?.completed ?? 0;
    const currentStepTotal = stage?.total ?? 0;

    const handleCancel = useCallback(() => {
        if (!task) return;
        void applicationClient.execute({ type: 'task.cancel', id: task.id }).then((result) => {
            if (result.ok) return;
            dispatch(batchActions([errorDialogActions.setVisible(true), errorDialogActions.setErrorMessage(result.error.message)]));
        });
    }, [applicationClient, dispatch, task]);

    const tracksProgress = totalTracks === 0 ? 0 : Math.floor((currentTrack / totalTracks) * 100);
    const currentStepProgress = currentStepTotal === 0 ? -1 : Math.floor((currentStepCurrent / currentStepTotal) * 100);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="recognize-dialog-slide-title"
            aria-describedby="recognize-dialog-slide-description"
        >
            <DialogTitle id="recognize-dialog-slide-title">Recognizing...</DialogTitle>
            <DialogContent>
                <Stepper activeStep={currentStep} orientation="vertical" style={{ paddingTop: 0 }}>
                    <Step>
                        <StepLabel>
                            <Typography>Reading</Typography>
                        </StepLabel>
                    </Step>
                    <Step>
                        <StepLabel>
                            <Typography>Computing checksums</Typography>
                        </StepLabel>
                    </Step>
                    <Step>
                        <StepLabel>
                            <Typography>Identifying song</Typography>
                        </StepLabel>
                    </Step>
                </Stepper>
                <DialogContentText id="recognize-dialog-slide-description" className={classes.label}>
                    Recognizing {Math.min(totalTracks, currentTrack + 1)} of {totalTracks}
                </DialogContentText>

                <LinearProgress
                    className={classes.progressBar}
                    variant={currentStepProgress === -1 ? 'indeterminate' : 'determinate'}
                    color="primary"
                    value={currentStepProgress}
                />
                <Box className={classes.progressPerc}>{currentStepCurrent !== -1 && `${currentStepProgress}%`}</Box>

                <DialogContentText id="recognize-dialog-slide-description" className={classes.label}>
                    {['Reading...', 'Computing checksums...', 'Identifying...'][currentStep]}
                </DialogContentText>
                <LinearProgress className={classes.progressBar} variant="determinate" color="secondary" value={tracksProgress} />
                <Box className={classes.progressPerc}>{tracksProgress}%</Box>
            </DialogContent>
            <DialogActions>
                <Button disabled={cancelled} onClick={handleCancel}>
                    {cancelled ? `Stopping after current track...` : `Cancel Recognizing`}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

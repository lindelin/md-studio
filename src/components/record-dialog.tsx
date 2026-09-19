import React from 'react';
import { useShallowEqualSelector } from '../frontend-utils';

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
import { W95RecordDialog } from './win95/record-dialog';
import { useDispatch } from '../frontend-utils';
import { requestTaskCancellation } from '../redux/actions';

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

    const { visible, taskId, trackTotal, trackDone, trackCurrent, titleCurrent } = useShallowEqualSelector(
        (state) => state.recordDialog
    );

    const progressValue = Math.round(trackCurrent);

    const vintageMode = useShallowEqualSelector((state) => state.appState.vintageMode);
    if (vintageMode) {
        const p = {
            visible,
            trackTotal,
            trackDone,
            trackCurrent,
            titleCurrent,
            progressValue,
            onCancel: taskId ? () => dispatch(requestTaskCancellation(taskId)) : undefined,
        };
        return <W95RecordDialog {...p} />;
    }

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="record-dialog-slide-title"
            aria-describedby="record-dialog-slide-description"
        >
            <DialogTitle id="record-dialog-slide-title">Recording...</DialogTitle>
            <DialogContent>
                <DialogContentText id="record-dialog-slide-description">
                    {`Recording track ${trackDone + 1} of ${trackTotal}: ${titleCurrent}`}
                </DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant={trackCurrent >= 0 ? 'determinate' : 'indeterminate'}
                    color="primary"
                    value={progressValue}
                />
                <Box className={classes.progressPerc}>{progressValue >= 0 ? `${progressValue}%` : ``}</Box>
            </DialogContent>
            <DialogActions>
                {taskId ? <Button onClick={() => dispatch(requestTaskCancellation(taskId))}>Cancel after current step</Button> : null}
            </DialogActions>
        </Dialog>
    );
};

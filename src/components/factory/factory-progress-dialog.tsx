import React, { useCallback } from 'react';
import { useShallowEqualSelector } from "../../frontend-utils";

import { actions as factoryProgressDialogActions } from '../../redux/factory/factory-progress-dialog-feature';

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
import { useDispatch } from '../../frontend-utils';

const useStyles = makeStyles()(theme => ({
    progressPerc: {
        marginTop: theme.spacing(1),
    },
    progressBar: {
        marginTop: theme.spacing(3),
    },
}));

const Transition = React.forwardRef(function Transition(
    props: SlideProps,
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const FactoryModeProgressDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();

    const { visible, actionName, units, currentProgress, totalProgress, additionalInfo, canBeCancelled, cancelled } = useShallowEqualSelector(
        state => state.factoryProgressDialog
    );

    const handleCancel = useCallback(() => {
        dispatch(factoryProgressDialogActions.setCancelled(true));
    }, [dispatch]);

    const progressValue = Math.round((100 / (totalProgress || 1)) * currentProgress);

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
                    {currentProgress >= 0
                        ? `${currentProgress} ${units} of ${totalProgress} done ${additionalInfo && `(${additionalInfo})`}`
                        : additionalInfo}
                </DialogContentText>
                <LinearProgress
                    className={classes.progressBar}
                    variant={currentProgress >= 0 ? 'determinate' : 'indeterminate'}
                    color="primary"
                    value={progressValue}
                />
                <Box className={classes.progressPerc}>{currentProgress >= 0 ? `${progressValue}%` : ``}</Box>
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

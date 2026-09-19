import React, { useState, useCallback } from 'react';
import { useDispatch } from '../frontend-utils';
import { useShallowEqualSelector } from '../frontend-utils';

import { actions as appActions } from '../redux/app-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import Warning from '../images/md_lock.svg?react';
import { Checkbox, FormControlLabel } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useUpdateApplicationSettings } from './use-application-client';

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const useStyles = makeStyles()((theme) => ({
    svg: {
        '& .text': {
            fill: theme.palette.text.primary,
        },
        margin: 'auto',
        marginBottom: theme.spacing(3),
        display: 'block',
    },
}));

export const DiscProtectedDialog = () => {
    const dispatch = useDispatch();
    const updateSettings = useUpdateApplicationSettings();
    const { classes } = useStyles();

    const visible = useShallowEqualSelector((state) => state.appState.discProtectedDialogVisible);
    const [doNotShowAgain, setDoNotShowAgain] = useState<boolean>(false);

    const handleClose = useCallback(() => {
        if (doNotShowAgain) {
            void updateSettings({ discProtectedDialogDisabled: true }).catch((error) =>
                window.alert(error instanceof Error ? error.message : String(error))
            );
        }
        dispatch(appActions.showDiscProtectedDialog(false));
    }, [dispatch, doNotShowAgain, updateSettings]);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition}
            aria-labelledby="disc-protected-dialog-slide-title"
        >
            <DialogTitle id="disc-protected-dialog-slide-title">Write Protected Disc</DialogTitle>
            <DialogContent>
                <Warning className={classes.svg} />
                <DialogContentText>The disc you have inserted is write protected.</DialogContentText>
                <DialogContentText>
                    You'll be able to use playback transport controls and disc ripping/archival functions, but not write or edit anything.
                </DialogContentText>
                <DialogContentText>Please eject, then unlock, and re-insert the disc if you need to make changes.</DialogContentText>

                <FormControlLabel
                    label="Do not show again"
                    control={<Checkbox checked={doNotShowAgain} onChange={(val) => setDoNotShowAgain(val.target.checked)} />}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};

import React, { useCallback } from 'react';
import { useShallowEqualSelector } from '../../frontend-utils';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { makeStyles } from 'tss-react/mui';
import { useDispatch } from '../../frontend-utils';
import { actions as factoryNoticeDialogActions } from '../../redux/factory/factory-notice-dialog-feature';
import { actions as appStateActions } from '../../redux/app-feature';
import { initializeFactoryMode } from '../../redux/factory/factory-actions';

const useStyles = makeStyles()(() => ({
    mainText: {
        whiteSpace: 'pre-wrap',
        textAlign: 'justify',
    },
}));

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const FactoryModeNoticeDialog = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const { visible } = useShallowEqualSelector((state) => state.factoryNoticeDialog);
    const handleClose = useCallback(() => {
        dispatch(factoryNoticeDialogActions.setVisible(false));
    }, [dispatch]);

    const handleSwitchToFactoryMode = useCallback(() => {
        dispatch(appStateActions.setMainView('FACTORY'));
        dispatch(initializeFactoryMode());
        handleClose();
    }, [dispatch, handleClose]);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="factory-notice-dialog-slide-title"
            aria-describedby="factory-notice-dialog-slide-description"
        >
            <DialogTitle id="factory-notice-dialog-slide-title">Important information</DialogTitle>
            <DialogContent>
                <DialogContentText id="factory-notice-dialog-slide-description" className={classes.mainText}>
                    Advanced tools use unsupported Homebrew functions that are outside the NetMD specification. Back up the raw TOC
                    before changing it and keep USB and device power stable until the disc refresh finishes.
                    {`\n\n`}
                    The visual editor keeps changes in a local draft. Before a write, it compares exact checksums and changed sectors,
                    verifies the same device session and disc revision, and requires a typed confirmation. A device without the
                    <b> flushUTOC</b> capability remains read-only.
                    {`\n\n`}
                    An active NetMD recording cannot currently be stopped safely in the middle of a track. Do not disconnect USB while a
                    recording light is flashing. Recovery downloads should only be attempted for tracks the device can play. See the
                    <Link href="https://www.minidisc.wiki/guides/webminidisc/homebrew"> MiniDisc Wiki Homebrew guide</Link> for device-specific
                    limitations.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button color={'primary'} onClick={handleSwitchToFactoryMode}>
                    Open advanced tools
                </Button>
            </DialogActions>
        </Dialog>
    );
};

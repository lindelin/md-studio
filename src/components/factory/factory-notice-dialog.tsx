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
import { readToc } from '../../redux/factory/factory-actions';

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
        dispatch(readToc());
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
                    You are about to enter the homebrew mode. The features accessible through this mode aren't part of the NetMD
                    specification and have not been developed by Sony. The developers of netmd‑exploits / netmd‑js are not responsible for
                    any damage done to the discs, data and / or players. From this point on, the software assumes you know what you are
                    doing and will not ask for confirmations or try to prevent damage.
                    {`\n\n`}
                    Some things to keep in mind:
                    {`\n`}- After exiting homebrew mode, the player needs to be reset by taking out the batteries. TOC changes won't be
                    applied otherwise. <b>This is important for Type-R devices in particular.</b>
                    {`\n`}- Don't enter the homebrew mode if there are any TOC Edits queued up.
                    {`\n`}- If any tracks / fragments / cells / timestamps are removed / added you will need to update the "Other TOC
                    Values", otherwise the changes won't be applied or the disc will become corrupted.
                    {`\n`}- Digital transferring of tracks via USB only works if the track can be played by the player. If you create an
                    invalid track and trigger a download, it will crash.
                    {`\n`}- After creating a track, please reset the player before downloading it. The players keep a second copy of the
                    TOC, which this software cannot alter.
                    {`\n`}- If the track download is stuck on 'Seeking...' it means the track is corrupted. If you are sure the track is
                    valid and can be played on the unit, please report it as a bug.
                    {`\n`}- This mode is still very unstable. If you find any bugs, please report them by creating an issue on
                    <Link href="https://github.com/asivery/webminidisc"> the upstream Web MiniDisc Pro issue tracker</Link> or by messaging
                    the developers on the <Link href="https://minidisc.wiki/discord">Minidisc.wiki Discord server</Link>.{`\n\n`}
                    To download a track via USB:
                    {`\n`}- Select the 'Position Sector' tab.
                    {`\n`}- With 'Shift' pressed down, the ToC tiles show their numbers instead of descriptions
                    {`\n`}- Select the ToC tile with the number of the track you want to download on the Track Junction Map
                    {`\n`}- If your device supports it, there should be a download button below the tables
                    {`\n\n`}Enter the homebrew mode?
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>No, get back to safety</Button>
                <Button color={'primary'} onClick={handleSwitchToFactoryMode}>
                    Yes, I know what I am doing
                </Button>
            </DialogActions>
        </Dialog>
    );
};

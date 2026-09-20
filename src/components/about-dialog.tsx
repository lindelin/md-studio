import React from 'react';
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
import Link from '@mui/material/Link';
import { GIT_DIFF, GIT_HASH, BUILD_DATE } from '../version-info';
import { useI18n } from './use-i18n';

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const AboutDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();

    const visible = useShallowEqualSelector((state) => state.appState.aboutDialogVisible);
    const handleClose = () => {
        dispatch(appActions.showAboutDialog(false));
    };

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="about-dialog-slide-title"
        >
            <DialogTitle id="about-dialog-slide-title">{t('About MiniDisc Workspace')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {t('MiniDisc Workspace is derived from')}{' '}
                    <Link rel="noopener noreferrer" href="https://github.com/asivery/webminidisc" target="_blank">
                        Web MiniDisc Pro
                    </Link>{' '}
                    {t('and uses')}
                </DialogContentText>
                <ul>
                    <li>
                        <Link rel="noopener noreferrer" href="https://www.ffmpeg.org/" target="_blank">
                            FFmpeg
                        </Link>{' '}
                        {t('and')}{' '}
                        <Link rel="noopener noreferrer" href="https://github.com/ffmpegjs/FFmpeg" target="_blank">
                            ffmpegjs
                        </Link>
                        {t(', to read your audio files (WAV, MP3, OGG, MP4, and more).')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://github.com/dcherednik/atracdenc/" target="_blank">
                            Atracdenc
                        </Link>
                        {t(', to support ATRAC3 encoding (LP2 and LP4).')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://emscripten.org/" target="_blank">
                            Emscripten
                        </Link>
                        {t(', to run FFmpeg and Atracdenc in the browser.')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://github.com/cybercase/netmd-js" target="_blank">
                            netmd-js
                        </Link>
                        {t(', to send commands to NetMD devices with JavaScript.')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://github.com/asivery/netmd-exploits" target="_blank">
                            netmd-exploits
                        </Link>
                        {t(', to download ATRAC through USB and run supported low-level firmware tools.')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://github.com/asivery/netmd-tocmanip" target="_blank">
                            netmd-tocmanip
                        </Link>
                        {t(', to read and edit the table of contents.')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://github.com/glaubitz/linux-minidisc" target="_blank">
                            linux-minidisc
                        </Link>
                        {t(', which made the netmd-js project possible.')}
                    </li>
                    <li>
                        <Link rel="noopener noreferrer" href="https://material-ui.com/" target="_blank">
                            material-ui
                        </Link>
                        {t(', to build the user interface.')}
                    </li>
                </ul>
                <DialogContentText>{t('Attribution')}</DialogContentText>
                <ul>
                    <li>
                        {t('MiniDisc logo from')}{' '}
                        <Link rel="noopener noreferrer" href="https://en.wikipedia.org/wiki/MiniDisc" target="_blank">
                            https://en.wikipedia.org/wiki/MiniDisc
                        </Link>
                    </li>
                    <li>
                        {t('MiniDisc icon from')}{' '}
                        <Link
                            rel="noopener noreferrer"
                            href="https://www.deviantart.com/blinkybill/art/Sony-MiniDisc-Plastic-Icon-473812540"
                            target="_blank"
                        >
                            http://fav.me/d7u3g3g
                        </Link>
                    </li>
                </ul>
                <DialogContentText style={{ textAlign: 'center', fontSize: 13 }}>
                    {t('Version')} #{GIT_HASH} {(GIT_DIFF as any) === '0' ? '' : `(${GIT_DIFF} ${t('diff lines ahead')})`} · {t('Built on')} {BUILD_DATE}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{t('Close')}</Button>
            </DialogActions>
        </Dialog>
    );
};

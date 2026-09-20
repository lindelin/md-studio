import React from 'react';
import { BUILD_DATE, GIT_DIFF, GIT_HASH } from '../version-info';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';

export const AboutDialog = ({ open, onClose }: { open: boolean; onClose(): void }) => {
    const { t } = useI18n();

    return (
        <AppDialog
            open={open}
            title={t('About MiniDisc Workspace')}
            onClose={onClose}
            actions={<button className="app-dialog__button--primary" onClick={onClose}>{t('Close')}</button>}
        >
            <p>
                {t('MiniDisc Workspace is derived from')}{' '}
                <a rel="noopener noreferrer" href="https://github.com/asivery/webminidisc" target="_blank">Web MiniDisc Pro</a>{' '}
                {t('and uses')}
            </p>
            <ul>
                <li><a rel="noopener noreferrer" href="https://www.ffmpeg.org/" target="_blank">FFmpeg</a> {t('and')} <a rel="noopener noreferrer" href="https://github.com/ffmpegjs/FFmpeg" target="_blank">ffmpegjs</a>{t(', to read your audio files (WAV, MP3, OGG, MP4, and more).')}</li>
                <li><a rel="noopener noreferrer" href="https://github.com/dcherednik/atracdenc/" target="_blank">Atracdenc</a>{t(', to support ATRAC3 encoding (LP2 and LP4).')}</li>
                <li><a rel="noopener noreferrer" href="https://emscripten.org/" target="_blank">Emscripten</a>{t(', to run FFmpeg and Atracdenc in the browser.')}</li>
                <li><a rel="noopener noreferrer" href="https://github.com/cybercase/netmd-js" target="_blank">netmd-js</a>{t(', to send commands to NetMD devices with JavaScript.')}</li>
                <li><a rel="noopener noreferrer" href="https://github.com/asivery/netmd-exploits" target="_blank">netmd-exploits</a>{t(', to download ATRAC through USB and run supported low-level firmware tools.')}</li>
                <li><a rel="noopener noreferrer" href="https://github.com/asivery/netmd-tocmanip" target="_blank">netmd-tocmanip</a>{t(', to read and edit the table of contents.')}</li>
                <li><a rel="noopener noreferrer" href="https://github.com/glaubitz/linux-minidisc" target="_blank">linux-minidisc</a>{t(', which made the netmd-js project possible.')}</li>
                <li><a rel="noopener noreferrer" href="https://material-ui.com/" target="_blank">Material UI</a>{t(', to build the user interface.')}</li>
            </ul>
            <p><strong>{t('Attribution')}</strong></p>
            <ul>
                <li>{t('MiniDisc logo from')} <a rel="noopener noreferrer" href="https://en.wikipedia.org/wiki/MiniDisc" target="_blank">Wikipedia</a></li>
                <li>{t('MiniDisc icon from')} <a rel="noopener noreferrer" href="https://www.deviantart.com/blinkybill/art/Sony-MiniDisc-Plastic-Icon-473812540" target="_blank">BlinkyBill</a></li>
            </ul>
            <p className="app-dialog__version">
                {t('Version')} #{GIT_HASH} {(GIT_DIFF as unknown) === '0' ? '' : `(${GIT_DIFF} ${t('diff lines ahead')})`} · {t('Built on')} {BUILD_DATE}
            </p>
        </AppDialog>
    );
};

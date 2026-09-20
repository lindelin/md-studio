import React from 'react';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';
import './help-dialog.css';

type HelpDialogProps = {
    open: boolean;
    onClose(): void;
};

export const HelpDialog = ({ open, onClose }: HelpDialogProps) => {
    const { t } = useI18n();

    return (
        <AppDialog open={open} onClose={onClose} title={t('Help & Support')} size="large">
            <div className="help-dialog">
                <section>
                    <h3>{t('Getting started')}</h3>
                    <ol>
                        <li>{t('Connect your recorder and choose the matching connection method.')}</li>
                        <li>{t('Import local audio, then review titles, order, groups and recording modes.')}</li>
                        <li>{t('Review the capacity estimate before starting the write task.')}</li>
                        <li>{t('Follow progress and saved files in the task center.')}</li>
                    </ol>
                </section>

                <section>
                    <h3>{t('Recording and stopping')}</h3>
                    <p>{t('A track already recording cannot be interrupted safely. End batch stops later tracks from starting, but the current track continues until the recorder finishes it.')}</p>
                    <p>{t('Keep the recorder powered and USB connected while its recording light is flashing.')}</p>
                </section>

                <section>
                    <h3>{t('USB connection troubleshooting')}</h3>
                    <ul>
                        <li>{t('Close other MiniDisc apps and browser tabs that may be using the recorder.')}</li>
                        <li>{t('Reconnect USB, confirm the recorder has power, then try again.')}</li>
                        <li>{t('On Windows, the recorder must use a compatible WinUSB driver.')}</li>
                    </ul>
                </section>

                <section>
                    <h3>{t('Local processing')}</h3>
                    <p>{t('Audio conversion, metadata work, device control and automation run on this computer. The hosted web app only delivers static application files.')}</p>
                </section>
            </div>
        </AppDialog>
    );
};

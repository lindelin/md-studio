import React, { useCallback, useState } from 'react';
import { useDispatch, useShallowEqualSelector } from '../frontend-utils';
import Warning from '../images/md_lock.svg?react';
import { actions as appActions } from '../redux/app-feature';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';
import { useUpdateApplicationSettings } from './use-application-client';

export const DiscProtectedDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const updateSettings = useUpdateApplicationSettings();
    const visible = useShallowEqualSelector((state) => state.appState.discProtectedDialogVisible);
    const [doNotShowAgain, setDoNotShowAgain] = useState(false);

    const handleClose = useCallback(() => {
        if (doNotShowAgain) {
            void updateSettings({ discProtectedDialogDisabled: true }).catch((error) =>
                window.alert(error instanceof Error ? error.message : String(error))
            );
        }
        dispatch(appActions.showDiscProtectedDialog(false));
    }, [dispatch, doNotShowAgain, updateSettings]);

    return (
        <AppDialog
            open={visible}
            size="small"
            title={t('Write Protected Disc')}
            onClose={handleClose}
            actions={<button className="app-dialog__button--primary" onClick={handleClose}>{t('OK')}</button>}
        >
            <Warning className="app-dialog__warning-illustration" />
            <p>{t('The disc you have inserted is write protected.')}</p>
            <p>{t("You'll be able to use playback transport controls and disc ripping/archival functions, but not write or edit anything.")}</p>
            <p>{t('Please eject, then unlock, and re-insert the disc if you need to make changes.')}</p>
            <label className="app-dialog__check">
                <input type="checkbox" checked={doNotShowAgain} onChange={(event) => setDoNotShowAgain(event.target.checked)} />
                <span>{t('Do not show again')}</span>
            </label>
        </AppDialog>
    );
};

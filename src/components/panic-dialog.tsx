import React, { useCallback } from 'react';
import { useDispatch, useShallowEqualSelector } from '../frontend-utils';
import { actions as panicDialogActions } from '../redux/panic-dialog-feature';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';

export const PanicDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const { visible, dismissed, errorProvided } = useShallowEqualSelector((state) => state.panicDialog);
    const handleReloadApp = useCallback(() => window.reload(), []);
    const handleIgnore = useCallback(() => dispatch(panicDialogActions.dismiss()), [dispatch]);

    return (
        <AppDialog
            open={visible && !dismissed}
            title={t('Oops… Something unexpected happened.')}
            onClose={handleIgnore}
            actions={
                <>
                    <button onClick={handleIgnore}>{t('Ignore and Continue')}</button>
                    <button className="app-dialog__button--primary" onClick={handleReloadApp}>{t('Restart the App')}</button>
                </>
            }
        >
            <p>{t('Try to restart the app. If the error persists, try the following:')}</p>
            <ol>
                <li>{t('Use your browser in incognito mode.')}</li>
                <li>{t('Use a blank MiniDisc.')}</li>
                <li>{t('Try MiniDisc Workspace on another computer.')}</li>
            </ol>
            <p>{t('If this does not solve the error, your device might not be supported yet or you may have encountered a bug.')}</p>
            <pre className="app-dialog__code">{errorProvided}</pre>
        </AppDialog>
    );
};

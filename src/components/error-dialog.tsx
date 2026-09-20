import React, { useCallback } from 'react';
import { useDispatch, useShallowEqualSelector } from '../frontend-utils';
import { actions as errorDialogActions } from '../redux/error-dialog-feature';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';

export const ErrorDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const { visible, error } = useShallowEqualSelector((state) => state.errorDialog);
    const handleClose = useCallback(() => dispatch(errorDialogActions.setVisible(false)), [dispatch]);

    return (
        <AppDialog
            open={visible}
            size="small"
            title={t('Error')}
            onClose={handleClose}
            actions={<button className="app-dialog__button--primary" onClick={handleClose}>{t('Close')}</button>}
        >
            <p role="alert">{error}</p>
        </AppDialog>
    );
};

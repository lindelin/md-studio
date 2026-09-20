import React, { useCallback } from 'react';
import { useDispatch } from '../frontend-utils';
import { useShallowEqualSelector } from '../frontend-utils';
import { actions as panicDialogActions } from '../redux/panic-dialog-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { makeStyles } from 'tss-react/mui';
import { useI18n } from './use-i18n';

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const useStyles = makeStyles()((theme) => ({
    codeBlock: {
        marginTop: theme.spacing(3),
        fontFamily: 'monospace',
        color: 'white',
        backgroundColor: '#EF5350',
        whiteSpace: 'pre-wrap',
        padding: theme.spacing(2),
        borderRadius: theme.spacing(1),
        fontSize: 10,
    },
}));

export const PanicDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const { classes } = useStyles();

    const { visible, dismissed, errorProvided } = useShallowEqualSelector((state) => state.panicDialog);

    const handleReloadApp = useCallback(() => {
        window.reload();
    }, []);

    const handleIgnore = useCallback(() => {
        dispatch(panicDialogActions.dismiss());
    }, [dispatch]);

    return (
        <Dialog
            open={visible && !dismissed}
            maxWidth={'sm'}
            fullWidth={true}
            scroll={'paper'}
            TransitionComponent={Transition as any}
            aria-labelledby="error-dialog-slide-title"
            aria-describedby="error-dialog-slide-description"
        >
            <DialogTitle id="alert-dialog-slide-title">{t('Oops… Something unexpected happened.')}</DialogTitle>
            <DialogContent>
                <Typography color="textSecondary" variant="body1" component="div">
                    {t('Try to restart the app. If the error persists, try the following:')}
                    <ol>
                        <li>{t('Use your browser in incognito mode.')}</li>
                        <li>{t('Use a blank MiniDisc.')}</li>
                        <li>{t('Try MiniDisc Workspace on another computer.')}</li>
                    </ol>
                    {t('If this does not solve the error, your device might not be supported yet or you may have encountered a bug.')}
                </Typography>
                <Typography variant="body1" component="div" className={classes.codeBlock}>
                    {errorProvided}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleIgnore} size="small">
                    {t('Ignore and Continue')}
                </Button>
                <Button onClick={handleReloadApp} color="primary">
                    {t('Restart the App')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

import React, { useCallback } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import HelpIcon from '@mui/icons-material/Help';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { makeStyles } from 'tss-react/mui';
import { useDispatch } from '../frontend-utils';
import { actions as appActions } from '../redux/app-feature';
import { useI18n } from './use-i18n';

const useStyles = makeStyles()((theme) => ({
    listItemIcon: {
        minWidth: theme.spacing(5),
    },
}));

export const TopMenu = function ({ onShowSettings }: { onShowSettings: () => void }) {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const { t } = useI18n();
    const helpLinkRef = React.useRef<null | HTMLAnchorElement>(null);
    const [menuAnchorEl, setMenuAnchorEl] = React.useState<null | HTMLElement>(null);
    const menuOpen = Boolean(menuAnchorEl);

    const handleMenuClose = useCallback(() => {
        setMenuAnchorEl(null);
    }, []);

    const handleShowSettings = useCallback(() => {
        onShowSettings();
        handleMenuClose();
    }, [handleMenuClose, onShowSettings]);

    const handleShowAbout = useCallback(() => {
        dispatch(appActions.showAboutDialog(true));
        handleMenuClose();
    }, [dispatch, handleMenuClose]);

    const handleHelpLink = useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            if (event.target !== helpLinkRef.current) helpLinkRef.current?.click();
            handleMenuClose();
        },
        [handleMenuClose]
    );

    return (
        <>
            <IconButton aria-label={t('Open application menu')} aria-controls="actions-menu" aria-haspopup="true" onClick={(event) => setMenuAnchorEl(event.currentTarget)}>
                <MoreVertIcon />
            </IconButton>
            <Menu id="actions-menu" anchorEl={menuAnchorEl} keepMounted open={menuOpen} onClose={handleMenuClose}>
                <MenuItem onClick={handleShowSettings}>
                    <ListItemIcon className={classes.listItemIcon}><SettingsIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('Settings')}</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleShowAbout}>
                    <ListItemIcon className={classes.listItemIcon}><InfoIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('About')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleHelpLink}>
                    <ListItemIcon className={classes.listItemIcon}><HelpIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>
                        <Link
                            rel="noopener noreferrer"
                            href="https://www.minidisc.wiki/guides/start"
                            target="_blank"
                            ref={helpLinkRef}
                            onClick={handleHelpLink}
                        >
                            {t('Support and FAQ')}
                        </Link>
                    </ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
};

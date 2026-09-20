import React, { useCallback } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import HelpIcon from '@mui/icons-material/Help';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useI18n } from './use-i18n';

export const TopMenu = function ({ onShowAbout, onShowHelp, onShowSettings }: { onShowAbout: () => void; onShowHelp: () => void; onShowSettings: () => void }) {
    const { t } = useI18n();
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
        onShowAbout();
        handleMenuClose();
    }, [handleMenuClose, onShowAbout]);

    const handleShowHelp = useCallback(() => {
        onShowHelp();
        handleMenuClose();
    }, [handleMenuClose, onShowHelp]);

    return (
        <>
            <IconButton aria-label={t('Open application menu')} aria-controls="actions-menu" aria-haspopup="true" onClick={(event) => setMenuAnchorEl(event.currentTarget)}>
                <MoreVertIcon />
            </IconButton>
            <Menu id="actions-menu" anchorEl={menuAnchorEl} keepMounted open={menuOpen} onClose={handleMenuClose}>
                <MenuItem onClick={handleShowSettings}>
                    <ListItemIcon sx={{ minWidth: 40 }}><SettingsIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('Settings')}</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleShowAbout}>
                    <ListItemIcon sx={{ minWidth: 40 }}><InfoIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('About')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleShowHelp}>
                    <ListItemIcon sx={{ minWidth: 40 }}><HelpIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('Support and FAQ')}</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
};

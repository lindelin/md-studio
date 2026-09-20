import React, { useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { makeStyles } from 'tss-react/mui';
import { useDispatch, useShallowEqualSelector } from '../../frontend-utils';
import { actions as appActions } from '../../redux/app-feature';
import { ExploitCapability } from '../../services/interfaces/capabilities';
import { useApplicationWorkspace } from '../use-application-client';
import { WorkbenchTocEditor } from '../workbench/workbench-toc-editor';
import { FactoryModeProgressDialog } from './factory-progress-dialog';
import { FactoryModeBadSectorDialog } from './factory-bad-sector-dialog';
import { FactoryTopMenu } from './factory-topmenu';
import { SettingsDialog } from '../settings-dialog';

const useStyles = makeStyles()((theme) => ({
    root: {
        minHeight: '100vh',
        color: '#edf4f9',
        background: '#0d151c',
    },
    head: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: theme.spacing(8),
        padding: theme.spacing(1, 2),
        borderBottom: '1px solid #2b3d49',
        background: '#101a22',
    },
    identity: {
        minWidth: 0,
    },
    title: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    firmware: {
        color: '#8fa3b1',
    },
}));

const Factory = () => {
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const workspace = useApplicationWorkspace();
    const { firmwareVersion, exploitCapabilities } = useShallowEqualSelector((state) => state.factory);
    const exitFactory = useCallback(() => dispatch(appActions.setMainView('MAIN')), [dispatch]);

    return (
        <main className={classes.root}>
            <Box className={classes.head}>
                <div className={classes.identity}>
                    <Typography component="h1" variant="h5" className={classes.title}>
                        {workspace.device?.deviceName || 'Advanced MiniDisc tools'}
                    </Typography>
                    <Typography component="p" variant="body2" className={classes.firmware}>
                        Firmware {firmwareVersion || 'unknown'} · compatibility maintenance view
                    </Typography>
                </div>
                <FactoryTopMenu />
            </Box>
            <WorkbenchTocEditor
                open
                embedded
                writeEnabled={exploitCapabilities.includes(ExploitCapability.flushUTOC)}
                writeDisabledReason="This firmware does not provide the flushUTOC capability. The editor is read-only."
                onClose={exitFactory}
                onMessage={(message) => window.alert(message)}
            />
            <FactoryModeProgressDialog />
            <FactoryModeBadSectorDialog />
            <SettingsDialog />
        </main>
    );
};

export default Factory;

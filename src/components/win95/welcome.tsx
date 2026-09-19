import React from 'react';
import { Button, WindowContent } from 'react95';
import { makeStyles } from 'tss-react/mui';
import { AboutDialog } from '../about-dialog';

const useStyles = makeStyles()(theme => ({
    pairingMessage: {
        color: 'red',
        marginTop: theme.spacing(1),
    },
    windowContent: {
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
    },
}));

export interface W95WelcomeProps {
    pairingFailed: boolean;
    pairingMessage: string;
    connectService: () => Promise<void>;
    connectName: string;
    connectingInProgress: boolean;
}

export const W95Welcome = (props: W95WelcomeProps) => {
    const { pairingFailed, pairingMessage, connectService, connectName, connectingInProgress } = props;
    const { classes } = useStyles();
    return (
        <>
            <WindowContent className={classes.windowContent}>
                <p style={{ paddingBottom: 8 }}>Press the button to connect to a NetMD device</p>
                <Button style={{ minWidth: 90 }} disabled={connectingInProgress} onClick={connectService}>
                    {connectingInProgress ? 'Connecting…' : connectName}
                </Button>
                <p style={{ visibility: pairingFailed ? 'visible' : 'hidden' }} className={classes.pairingMessage}>
                    {pairingMessage}
                </p>
            </WindowContent>
            <AboutDialog />
        </>
    );
};

import React, { useState, useEffect } from 'react';
import { useApplicationWorkspace } from './use-application-client';

import FormHelperText from '@mui/material/FormHelperText';
import { Controls } from './controls';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { makeStyles } from 'tss-react/mui';
import { requestBrowserAudioDevices } from '../application/browser-audio-devices';

const useStyles = makeStyles()((theme) => ({
    container: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginRight: -theme.spacing(2),
        flexFlow: 'wrap',
    },
    formControl: {
        minWidth: 120,
    },
    selectEmpty: {
        marginTop: theme.spacing(2),
    },
    factoryModeNotice: {
        marginBottom: theme.spacing(2),
        fontWeight: 'bold',
    },
}));

export function LineInDeviceSelect({ handleChange, inputDeviceId }: { handleChange: (ev: any) => void; inputDeviceId: string }) {
    const { classes } = useStyles();

    const supportsFactoryMode = useApplicationWorkspace().device?.capabilities.includes('advanced.factory') ?? false;
    const [devices, setInputDevices] = useState<{ deviceId: string; label: string }[]>([]);

    useEffect(() => {
        async function updateDeviceList() {
            setInputDevices(await requestBrowserAudioDevices());
        }
        void updateDeviceList().catch((error) => console.error('Could not list browser audio inputs.', error));
    }, [setInputDevices]);
    return (
        <React.Fragment>
            {supportsFactoryMode && (
                <Typography component="h4" variant="body2" className={classes.factoryModeNotice}>
                    It looks like this player supports the homebrew mode - it might be capable of RH1-style digital transfer. Please check
                    the homebrew mode for more information.
                </Typography>
            )}

            <Typography component="p" variant="body2">
                1. Connect your MD Player line-out to your PC audio line-in.
            </Typography>
            <Typography component="p" variant="body2">
                2. Use the controls at the bottom right to play some tracks.
            </Typography>
            <Typography component="p" variant="body2">
                3. Select the input source. You should hear the tracks playing on your PC.
            </Typography>
            <Typography component="p" variant="body2">
                4. Adjust the input gain and the line-out volume of your device.
            </Typography>
            <Box className={classes.container}>
                <FormControl className={classes.formControl}>
                    <Select value={inputDeviceId} onChange={handleChange} displayEmpty className={classes.selectEmpty}>
                        <MenuItem value="" disabled>
                            Input Source
                        </MenuItem>
                        {devices.map((device) => (
                            <MenuItem key={device.deviceId} value={device.deviceId}>
                                {device.label}
                            </MenuItem>
                        ))}
                    </Select>
                    <FormHelperText>Input Source</FormHelperText>
                </FormControl>
                <Controls />
            </Box>
        </React.Fragment>
    );
}

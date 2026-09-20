import React, { ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from '../frontend-utils';
import { forAnyDesktop, forWideDesktop, useShallowEqualSelector } from '../frontend-utils';

import { actions as appActions } from '../redux/app-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { makeStyles } from 'tss-react/mui';
import { AudioServices, resolveAudioServiceIndex } from '../services/audio-export-service-manager';
import { renderCustomParameter } from './custom-parameters-renderer';
import { initializeParameters, isAllValid } from '../custom-parameters';
import { SettingInterface } from '../bridge-types';
import { LibraryServices } from '../services/library-services';
import { useApplicationSettings, useUpdateApplicationSettings } from './use-application-client';
import type { UserSettingsUpdate } from '../application/settings-store';
import { useI18n } from './use-i18n';

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

function deepCompare<T>(a: T, b: T) {
    if (typeof a !== 'object') {
        return a === b;
    }
    if (Array.isArray(a)) {
        for (const e in a) {
            if (a[e] !== (b as any)[e]) return false;
        }
        return true;
    }
    for (const [k, v] of Object.entries(a as any)) {
        if (!deepCompare(v, (b as any)[k])) return false;
    }
    return true;
}

const useStyles = makeStyles()((theme) => ({
    main: {
        [forAnyDesktop(theme)]: {
            height: 600,
        },
        [forWideDesktop(theme)]: {
            height: 700,
        },
    },
    propertyBox: {
        display: 'flex',
        alignItems: 'center',
        marginRight: 0,
    },
    spread: {
        display: 'block',
        flexGrow: 1,
    },
    wider: {
        minWidth: 150,
    },
    header: {
        color: theme.palette.primary.main,
        '&:not(:first-of-type)': {
            marginTop: theme.spacing(3),
        },
    },
    fieldMargin: {
        marginLeft: theme.spacing(2),
    },
    encoderDescription: {
        marginLeft: theme.spacing(2),
        marginBottom: theme.spacing(2),
        marginTop: theme.spacing(2),
    },
    marginApply: {
        marginLeft: theme.spacing(2),
        paddingRight: theme.spacing(2),
    },
    noLeftMargin: {
        marginLeft: 0,
    },
}));

const SimpleField = ({
    children,
    name,
    classes,
    formControl = false,
    tooltip,
}: {
    name: string;
    formControl?: boolean;
    children: ReactElement<any, any>;
    classes: ReturnType<typeof useStyles>['classes'];
    tooltip?: string;
}) => {
    const element = formControl ? (
        <FormControlLabel
            labelPlacement="start"
            label={name + ':'}
            name={name + ':'}
            control={children}
            classes={{ root: classes.propertyBox, label: classes.spread }}
        />
    ) : (
        <Box className={classes.propertyBox}>
            <Typography className={classes.fieldMargin}>{name}:</Typography>
            <span className={classes.spread} />
            {children}
        </Box>
    );

    if (tooltip) {
        return <Tooltip title={tooltip}>{element}</Tooltip>;
    } else {
        return element;
    }
};

const NativeFields = ({ section, classes }: { section: string; classes: any }) => {
    const { t } = useI18n();
    const [settings, setSettings] = useState<SettingInterface[]>([]);
    const [_state, _updateState] = useState({});
    useEffect(() => {
        if (!window.native?.getSettings) return;
        (async () => {
            const settings = await window.native!.getSettings!();
            setSettings(settings);
        })();
    }, [_state]);

    if (!window.native?.getSettings) return <></>;

    const filtered = settings.filter((e) => e.family === section);
    const updateState = () => _updateState({});

    return filtered.map((entry) => {
        if (entry.type === 'action') {
            return (
                <SimpleField name={t(entry.name)} classes={classes} formControl={true} key={entry.family + entry.name}>
                    <Button onClick={() => entry.update(true)}>{t('Go')}</Button>
                </SimpleField>
            );
        } else if (entry.type === 'boolean') {
            return (
                <SimpleField name={t(entry.name)} classes={classes} formControl={true} key={entry.family + entry.name}>
                    <Switch checked={entry.state as boolean} onChange={() => entry.update(!entry.state).then(updateState)} />
                </SimpleField>
            );
        } else {
            return renderCustomParameter(
                {
                    type: entry.type,
                    userFriendlyName: t(entry.name),
                    varName: entry.family + entry.name,
                },
                entry.state,
                (_, nv) => entry.update(nv).then(updateState),
                classes.marginApply,
                t
            );
        }
    });
};

export const SettingsDialog = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const { classes } = useStyles();

    const visible = useShallowEqualSelector((state) => state.appState.settingsDialogVisible);
    const localBridgeEnabled = useShallowEqualSelector((state) => state.appState.localBridgeEnabled);
    const settings = useApplicationSettings();
    const updateSettings = useUpdateApplicationSettings();
    const {
        colorTheme,
        uiLanguage,
        pageFullHeight,
        pageFullWidth,
        fullWidthSupport,
        archiveDiscCreateZip,
        factoryModeUseSlowerExploit,
        factoryModeNERAWDownload,
        discProtectedDialogDisabled,
        audioExportService: globalStateAudioExportService,
        audioExportServiceConfig: globalStateAudioExportServiceConfig,
        libraryService: globalStateLibraryService,
        libraryServiceConfig: globalStateLibraryServiceConfig,
    } = settings;

    // Encoder properties
    const [currentExportService, setCurrentExportService] = useState(resolveAudioServiceIndex(globalStateAudioExportService));
    const [currentExportServiceConfig, setExportServiceConfig] = useState(globalStateAudioExportServiceConfig);
    const [currentLibraryService, setCurrentLibraryService] = useState(globalStateLibraryService);
    const [currentLibraryServiceConfig, setLibraryServiceConfig] = useState(globalStateLibraryServiceConfig);
    const currentService = AudioServices[currentExportService ?? 0];
    const currentLibrary = LibraryServices[currentLibraryService ?? -1];

    // Functions required for the app to calculate weather or not it needs to restart to apply the changes,
    // create the initial state, etc...
    // Later more reboot-sensitive fileds can be added
    const getStateRebootRequired = useMemo(
        () => () => ({
            currentExportServiceConfig,
            currentExportService,
            currentLibraryService,
            currentLibraryServiceConfig,
            localBridgeEnabled,
        }),
        [currentExportServiceConfig, currentExportService, currentLibraryService, currentLibraryServiceConfig, localBridgeEnabled]
    );
    const saveBeforeReset = useCallback(
        () =>
            updateSettings({
                audioExportService: currentExportService,
                audioExportServiceConfig: currentExportServiceConfig,
                libraryService: currentLibraryService,
                libraryServiceConfig: currentLibraryServiceConfig,
            }),
        [currentExportService, currentExportServiceConfig, currentLibraryService, currentLibraryServiceConfig, updateSettings]
    );

    const [initialState, setInitialState] = useState<ReturnType<typeof getStateRebootRequired> | null>(null);

    // "Constructor" code
    useEffect(() => {
        if (visible && initialState === null) {
            // Save the initial state when the dialog opens
            setInitialState(getStateRebootRequired());
        }
    }, [visible, initialState, getStateRebootRequired]);

    const isRestartRequired = useCallback(() => {
        if (initialState === null) return false;
        return !deepCompare(getStateRebootRequired(), initialState);
    }, [initialState, getStateRebootRequired]);

    const verifyIfInputsValid = useCallback(() => {
        // Later more inputs can be added
        const canExit = isAllValid(currentService.customParameters, currentExportServiceConfig);
        return canExit;
    }, [currentExportServiceConfig, currentService.customParameters]);

    const applySetting = useCallback(
        (changes: UserSettingsUpdate) => {
            void updateSettings(changes).catch((error) => {
                window.alert(error instanceof Error ? error.message : String(error));
            });
        },
        [updateSettings]
    );

    //Appearance configuration
    const handleThemeChange = useCallback(
        (event: any) => {
            applySetting({ colorTheme: event.target.value as 'dark' | 'light' | 'system' });
        },
        [applySetting]
    );
    const handleLanguageChange = useCallback(
        (event: any) => {
            applySetting({ uiLanguage: event.target.value as 'system' | 'en' | 'zh-CN' });
        },
        [applySetting]
    );
    const handlePageFullHeightChange = useCallback(() => {
        applySetting({ pageFullHeight: !pageFullHeight });
    }, [applySetting, pageFullHeight]);
    const handlePageFullWidthChange = useCallback(() => {
        applySetting({ pageFullWidth: !pageFullWidth });
    }, [applySetting, pageFullWidth]);

    // Functionality configuration
    const handleToggleFullWidth = useCallback(() => {
        applySetting({ fullWidthSupport: !fullWidthSupport });
    }, [applySetting, fullWidthSupport]);
    const handleToggleLocalBridge = useCallback(() => {
        dispatch(appActions.setLocalBridgeEnabled(!localBridgeEnabled));
    }, [dispatch, localBridgeEnabled]);
    const handleToggleDiscProtectedDialogDisabled = useCallback(() => {
        applySetting({ discProtectedDialogDisabled: !discProtectedDialogDisabled });
    }, [applySetting, discProtectedDialogDisabled]);
    const handleToggleArchiveDiscCreateZip = useCallback(() => {
        applySetting({ archiveDiscCreateZip: !archiveDiscCreateZip });
    }, [applySetting, archiveDiscCreateZip]);
    const handleToggleFactoryModeUseSlowerExploits = useCallback(() => {
        applySetting({ factoryModeUseSlowerExploit: !factoryModeUseSlowerExploit });
    }, [applySetting, factoryModeUseSlowerExploit]);
    const handleToggleFactoryModeNERAWDownload = useCallback(() => {
        applySetting({ factoryModeNERAWDownload: !factoryModeNERAWDownload });
    }, [applySetting, factoryModeNERAWDownload]);

    //Encoder configuration
    const handleExportServiceChanges = useCallback((event: any) => {
        const serviceId = event.target.value as number;
        setCurrentExportService(serviceId);
        setExportServiceConfig(initializeParameters(AudioServices[serviceId].customParameters));
    }, []);

    const handleExportServiceParameterChange = useCallback((varName: string, value: string | number | boolean) => {
        setExportServiceConfig((oldData) => {
            const newData = { ...oldData };
            newData[varName] = value;
            return newData;
        });
    }, []);
    const handleLibraryServiceChanges = useCallback((event: any) => {
        const serviceId = event.target.value as number;
        setCurrentLibraryService(serviceId);
        if (serviceId === -1) return;
        setLibraryServiceConfig(initializeParameters(LibraryServices[serviceId].customParameters));
    }, []);

    const handleLibraryServiceParameterChange = useCallback((varName: string, value: string | number | boolean) => {
        setLibraryServiceConfig((oldData) => {
            const newData = { ...oldData };
            newData[varName] = value;
            return newData;
        });
    }, []);

    const handleClose = useCallback(() => {
        setInitialState(null);
        if (isRestartRequired()) {
            void saveBeforeReset()
                .then(() => window.reload())
                .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
        } else {
            dispatch(appActions.showSettingsDialog(false));
        }
    }, [isRestartRequired, dispatch, saveBeforeReset]);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            classes={{ paper: classes.main }}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="about-dialog-slide-title"
        >
            <DialogTitle id="about-dialog-slide-title">{t('Settings')}</DialogTitle>
            <DialogContent>
                <DialogContentText className={classes.header}>{t('APPEARANCE')}</DialogContentText>
                <SimpleField name={t('Language')} classes={classes}>
                    <Select className={classes.wider} value={uiLanguage} onChange={handleLanguageChange}>
                        <MenuItem value="system">{t('Follow browser language')}</MenuItem>
                        <MenuItem value="zh-CN">{t('Chinese (Simplified)')}</MenuItem>
                        <MenuItem value="en">{t('English')}</MenuItem>
                    </Select>
                </SimpleField>
                <SimpleField name={t('Color theme')} classes={classes}>
                    <Select className={classes.wider} value={colorTheme} onChange={handleThemeChange}>
                        <MenuItem value="light">{t('Light')}</MenuItem>
                        <MenuItem value="dark">{t('Dark')}</MenuItem>
                        <MenuItem value="system">{t('Use system theme')}</MenuItem>
                    </Select>
                </SimpleField>
                <SimpleField name={t('Stretch MiniDisc Workspace to fill the screen vertically')} classes={classes} formControl={true}>
                    <Switch checked={pageFullHeight} onChange={handlePageFullHeightChange} />
                </SimpleField>
                <SimpleField name={t('Stretch MiniDisc Workspace to fill the screen horizontally')} classes={classes} formControl={true}>
                    <Switch checked={pageFullWidth} onChange={handlePageFullWidthChange} />
                </SimpleField>
                <NativeFields classes={classes} section="Appearance" />

                <DialogContentText className={classes.header}>{t('Functionality')}</DialogContentText>
                <SimpleField
                    name={t('Enable full width title editing')}
                    classes={classes}
                    formControl={true}
                    tooltip={t('This advanced feature enables the use of Hiragana and Kanji alphabets. More about this in Support and FAQ.')}
                >
                    <Switch checked={fullWidthSupport} onChange={handleToggleFullWidth} />
                </SimpleField>
                <SimpleField name={t('Enable disc-protected warning dialog')} classes={classes} formControl={true}>
                    <Switch checked={!discProtectedDialogDisabled} onChange={handleToggleDiscProtectedDialogDisabled} />
                </SimpleField>
                <SimpleField
                    name={t('Enable local MCP and CLI bridge')}
                    classes={classes}
                    formControl={true}
                    tooltip={t('Allows a loopback-only process on this computer to control the connected device. The app reloads when this setting changes.')}
                >
                    <Switch checked={localBridgeEnabled} onChange={handleToggleLocalBridge} />
                </SimpleField>
                <SimpleField
                    name={t("Create a ZIP file when using 'Archive Disc'")}
                    classes={classes}
                    formControl={true}
                    tooltip={t("Enabling it might increase memory usage when using the Homebrew mode's 'Archive Disc' feature")}
                >
                    <Switch checked={archiveDiscCreateZip} onChange={handleToggleArchiveDiscCreateZip} />
                </SimpleField>
                <SimpleField
                    name={t('Use the slower exploit for ATRAC ripping')}
                    classes={classes}
                    formControl={true}
                    tooltip={t('This fixes a bug where the device would lock up on a small percentage of Apple ARM-based Macs')}
                >
                    <Switch checked={factoryModeUseSlowerExploit} onChange={handleToggleFactoryModeUseSlowerExploits} />
                </SimpleField>
                <SimpleField
                    name={t('Download raw streams from netmd-exploits (expert feature)')}
                    classes={classes}
                    formControl={true}
                    tooltip={t("This will cause netmd-exploits to download .NERAW files instead of .AEA or .WAV. These files can be used to reconstruct the sector layout in the player's DRAM and rebuild the track in case of a corruption")}
                >
                    <Switch checked={factoryModeNERAWDownload} onChange={handleToggleFactoryModeNERAWDownload} />
                </SimpleField>
                <NativeFields classes={classes} section="Functionality" />

                <DialogContentText className={classes.header}>{t('ENCODING')}</DialogContentText>
                <SimpleField name={t('LP / HiMD encoder to use')} classes={classes}>
                    <Select className={classes.wider} value={currentExportService} onChange={handleExportServiceChanges}>
                        {AudioServices.map((n, i) => (
                            <MenuItem value={i} key={n.id} disabled={!n.available}>
                                {n.name}
                                {n.available ? '' : t(' (unavailable in this build)')}
                            </MenuItem>
                        ))}
                    </Select>
                </SimpleField>
                <Typography className={classes.encoderDescription}>{currentService.description ? t(currentService.description) : ''}</Typography>
                <Box className={classes.fieldMargin}>
                    {currentService.customParameters?.map((n) =>
                        renderCustomParameter(
                            { ...n, userFriendlyName: t(n.userFriendlyName) },
                            currentExportServiceConfig![n.varName],
                            handleExportServiceParameterChange,
                            classes.noLeftMargin,
                            t
                        )
                    )}
                </Box>

                <DialogContentText className={classes.header}>{t('Library')}</DialogContentText>
                <SimpleField name={t('Library to use')} classes={classes}>
                    <Select className={classes.wider} value={currentLibraryService} onChange={handleLibraryServiceChanges}>
                        <MenuItem value={-1} key="library-none">
                            {t('None')}
                        </MenuItem>
                        {LibraryServices.map((n, i) => (
                            <MenuItem value={i} key={`lib-${i}`}>
                                {n.name}
                            </MenuItem>
                        ))}
                    </Select>
                </SimpleField>
                {currentLibrary && (
                    <>
                        <Typography className={classes.encoderDescription}>{currentLibrary.description ? t(currentLibrary.description) : ''}</Typography>
                        <Box className={classes.fieldMargin}>
                            {currentLibrary.customParameters?.map((n) =>
                                renderCustomParameter(
                                    { ...n, userFriendlyName: t(n.userFriendlyName) },
                                    currentLibraryServiceConfig![n.varName],
                                    handleLibraryServiceParameterChange,
                                    classes.noLeftMargin,
                                    t
                                )
                            )}
                        </Box>
                    </>
                )}
                <NativeFields classes={classes} section="Encoding" />
            </DialogContent>
            <DialogActions>
                <Button disabled={!verifyIfInputsValid()} onClick={handleClose}>
                    {t(isRestartRequired() ? 'Save and Reload' : 'Close')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

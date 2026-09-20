import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import LibraryMusicRoundedIcon from '@mui/icons-material/LibraryMusicRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import React, { useCallback, useState } from 'react';
import { batchActions, useDispatch, useShallowEqualSelector } from '../frontend-utils';
import { initializeParameters } from '../custom-parameters';
import { deleteService } from '../redux/actions';
import { actions as appActions } from '../redux/app-feature';
import { actions as errorDialogActions } from '../redux/error-dialog-feature';
import { actions as otherDialogActions } from '../redux/other-device-feature';
import { doesServiceRequireChrome, getSimpleServices, Services } from '../services/interface-service-manager';
import ChromeIconPath from '../images/chrome-icon.svg';
import { AboutDialog } from './about-dialog';
import { OtherDeviceDialog } from './other-device-dialog';
import { TopMenu } from './topmenu';
import { useApplicationClient, useApplicationWorkspace } from './use-application-client';
import { useI18n } from './use-i18n';
import { WorkbenchSettingsDialog } from './workbench/workbench-settings-dialog';
import './welcome.css';

export const Welcome = () => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const applicationClient = useApplicationClient();
    const { connection } = useApplicationWorkspace();
    const { browserSupported, runningChrome, availableServices, lastSelectedService } = useShallowEqualSelector(
        (state) => state.appState
    );
    const [showWhyUnsupported, setWhyUnsupported] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const closeSettings = useCallback(() => setSettingsOpen(false), []);
    const simpleServicesLength = getSimpleServices().length;
    const selectedIndex = availableServices[lastSelectedService] ? lastSelectedService : 0;
    const selectedService = availableServices[selectedIndex];
    const selectedServiceIsCustom = selectedIndex >= simpleServicesLength;
    const connecting = connection.phase === 'connecting';
    const connectionFailed = connection.phase === 'error';
    const selectedServiceUnavailable = Boolean(
        selectedService && doesServiceRequireChrome(selectedService) && !runningChrome
    );

    const connectToService = async () => {
        if (!selectedService) return;
        dispatch(appActions.setLastSelectedService(selectedIndex));
        try {
            const result = await applicationClient.connectLocalDevice(selectedService);
            if (result.connected) {
                dispatch(
                    batchActions([
                        appActions.setMainView('MAIN'),
                        errorDialogActions.setErrorMessage(''),
                        errorDialogActions.setVisible(false),
                    ])
                );
            }
        } catch (error) {
            console.error(error);
        }
    };

    const addCustomDevice = () => {
        const firstService = Services.find((service) => service.customParameters);
        if (!firstService?.customParameters) return;
        dispatch(
            batchActions([
                otherDialogActions.setVisible(true),
                otherDialogActions.setSelectedServiceIndex(0),
                otherDialogActions.setCustomParameters(initializeParameters(firstService.customParameters)),
            ])
        );
    };

    const removeSelectedCustomDevice = () => {
        if (!selectedServiceIsCustom) return;
        dispatch(deleteService(selectedIndex));
    };

    return (
        <div className="welcome-workspace">
            <header className="welcome-workspace__header">
                <div className="welcome-workspace__brand">
                    <span className="welcome-workspace__brand-mark" aria-hidden="true"><UsbRoundedIcon /></span>
                    <span><strong>{t('MiniDisc Workspace')}</strong><small>{t('Local first · Open source')}</small></span>
                </div>
                <TopMenu onShowSettings={openSettings} />
            </header>

            <main className="welcome-workspace__main">
                <section className="welcome-workspace__hero">
                    <span className="welcome-workspace__eyebrow">{t('MINIDISC, MODERNIZED')}</span>
                    <h1>{t('Your MiniDisc, organized.')}</h1>
                    <p>{t('Connect, arrange, record and recover from one focused workspace.')}</p>
                    <div className="welcome-workspace__proofs" aria-label={t('Application highlights')}>
                        <span><UsbRoundedIcon />{t('Local USB control')}</span>
                        <span><CheckCircleOutlineRoundedIcon />{t('No account required')}</span>
                        <span><SecurityRoundedIcon />{t('Open source')}</span>
                    </div>
                </section>

                <section className="welcome-workspace__connect-card" aria-labelledby="welcome-connect-title">
                    {browserSupported ? (
                        <>
                            <span className="welcome-workspace__eyebrow">{t('CONNECT A DEVICE')}</span>
                            <h2 id="welcome-connect-title">{t('Choose how to connect')}</h2>
                            <p>{t('Select the adapter that matches your recorder or local service.')}</p>
                            <label className="welcome-workspace__field">
                                <span>{t('Connection method')}</span>
                                <select value={selectedIndex} disabled={connecting} onChange={(event) => dispatch(appActions.setLastSelectedService(Number(event.target.value)))}>
                                    {availableServices.map((service, index) => <option value={index} key={`${service.name}:${index}`}>{service.name}</option>)}
                                </select>
                            </label>
                            <div className="welcome-workspace__actions">
                                <button className="welcome-workspace__primary" disabled={connecting || selectedServiceUnavailable || !selectedService} onClick={() => void connectToService()}><UsbRoundedIcon />{connecting ? t('Connecting…') : t('Connect device')}</button>
                                <button className="welcome-workspace__secondary" disabled={connecting} onClick={addCustomDevice}><AddRoundedIcon />{t('Add custom device')}</button>
                                {selectedServiceIsCustom ? <button className="welcome-workspace__danger" disabled={connecting} onClick={removeSelectedCustomDevice}><DeleteOutlineRoundedIcon />{t('Remove')}</button> : null}
                            </div>
                            {selectedServiceUnavailable ? <div className="welcome-workspace__notice">{t('The selected connection needs a Chromium browser with WebUSB.')}</div> : null}
                            {connectionFailed ? <div className="welcome-workspace__error" role="alert"><strong>{t('Connection failed')}</strong><span>{connection.message}</span></div> : null}
                            {!window.native?.interface && navigator.userAgent.includes('Vivaldi') ? <div className="welcome-workspace__notice"><strong>{t('Notice for users of the Vivaldi web browser')}</strong><span>{t("Vivaldi's implementation of WebUSB is broken.")} {t('Please switch to a different Chromium-based browser.')}</span></div> : null}
                            <a className="welcome-workspace__guide" rel="noopener noreferrer" target="_blank" href="https://www.minidisc.wiki/guides/webminidisc">{t('First time here? Read the guide')}<LaunchRoundedIcon /></a>
                        </>
                    ) : (
                        <>
                            <img className="welcome-workspace__browser-icon" alt={t('Chrome logo')} src={ChromeIconPath} />
                            <span className="welcome-workspace__eyebrow">{t('BROWSER REQUIREMENTS')}</span>
                            <h2 id="welcome-connect-title">{t('This browser cannot connect directly to USB MiniDisc devices.')}</h2>
                            <p>{t('Use a Chromium browser for WebUSB, or continue if you only need a remote device.')}</p>
                            <div className="welcome-workspace__actions">
                                <a className="welcome-workspace__primary" rel="noopener noreferrer" target="_blank" href="https://www.google.com/chrome/">Chrome<LaunchRoundedIcon /></a>
                                <button className="welcome-workspace__secondary" onClick={() => dispatch(appActions.setBrowserSupported(true))}>{t('Continue for remote devices')}</button>
                            </div>
                            <button className="welcome-workspace__text-button" onClick={() => setWhyUnsupported((visible) => !visible)}>{t('Why WebUSB is required')}</button>
                            {showWhyUnsupported ? <ul className="welcome-workspace__requirements"><li>{t('WebUSB is needed to control the NetMD device via the USB connection to your computer.')}</li><li>{t('WebAssembly is used to convert the music to a MiniDisc compatible format')}</li></ul> : null}
                        </>
                    )}
                </section>
            </main>

            <section className="welcome-workspace__features" aria-label={t('Application highlights')}>
                <article><LibraryMusicRoundedIcon /><div><strong>{t('Built for real collections')}</strong><p>{t('Arrange tracks and groups before recording, with capacity and title checks.')}</p></div></article>
                <article><CheckCircleOutlineRoundedIcon /><div><strong>{t('One queue for every workflow')}</strong><p>{t('The interface, MCP and CLI share the same plan and task state.')}</p></div></article>
                <article><SecurityRoundedIcon /><div><strong>{t('Safer advanced tools')}</strong><p>{t('Destructive actions require a review and exact confirmation.')}</p></div></article>
            </section>

            <footer className="welcome-workspace__footer">
                <span>{t('Independent open-source project derived from Web MiniDisc Pro.')}</span>
                <span>© Stefano Brilli, Asivery · {new Date().getFullYear()}</span>
            </footer>

            <WorkbenchSettingsDialog open={settingsOpen} onClose={closeSettings} />
            <AboutDialog />
            <OtherDeviceDialog />
        </div>
    );
};

export default Welcome;

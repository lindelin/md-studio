import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import LibraryMusicRoundedIcon from '@mui/icons-material/LibraryMusicRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import React, { useCallback, useState } from 'react';
import {
    doesServiceRequireChrome,
    getSimpleServices,
    Services,
    type ServiceConstructionInfo,
} from '../services/interface-service-manager';
import ChromeIconPath from '../images/chrome-icon.svg';
import { AboutDialog } from './about-dialog';
import { HelpDialog } from './help-dialog';
import { OtherDeviceDialog } from './other-device-dialog';
import { TopMenu } from './topmenu';
import { useApplicationClient, useApplicationWorkspace } from './use-application-client';
import { useI18n } from './use-i18n';
import { WorkbenchSettingsDialog } from './workbench/workbench-settings-dialog';
import { AppDialog } from './app-dialog';
import { browserPreferences } from '../frontend/browser-preferences-store';
import { useBrowserPreferences } from '../frontend/use-browser-preferences';
import './welcome.css';

export const Welcome = () => {
    const { t } = useI18n();
    const applicationClient = useApplicationClient();
    const { connection } = useApplicationWorkspace();
    const { availableServices, lastSelectedService } = useBrowserPreferences();
    const runningChrome = Boolean(navigator.usb || window.native?.interface || window.native?.himdFullInterface);
    const browserSupported = runningChrome;
    const [showWhyUnsupported, setWhyUnsupported] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [customDeviceOpen, setCustomDeviceOpen] = useState(false);
    const [preferenceError, setPreferenceError] = useState<string | null>(null);
    const [fullHimdReview, setFullHimdReview] = useState<{ service: ServiceConstructionInfo; index: number } | null>(null);
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

    const connectToService = async (service = selectedService, serviceIndex = selectedIndex) => {
        if (!service) return;
        try {
            browserPreferences.setSelectedService(serviceIndex);
            setPreferenceError(null);
        } catch (error) {
            setPreferenceError(t(error instanceof Error ? error.message : String(error)));
        }
        try {
            await applicationClient.connectLocalDevice(service);
        } catch (error) {
            console.error(error);
        }
    };

    const requestConnection = () => {
        if (!selectedService) return;
        if (selectedService.id === 'himd-full' && !window.native?.himdFullInterface) {
            setFullHimdReview({ service: selectedService, index: selectedIndex });
            return;
        }
        void connectToService();
    };

    const addCustomDevice = () => {
        if (!Services.some((service) => service.customParameters)) return;
        setCustomDeviceOpen(true);
    };

    const removeSelectedCustomDevice = () => {
        if (!selectedServiceIsCustom) return;
        void Promise.resolve().then(() => browserPreferences.deleteService(selectedIndex)).then(() => setPreferenceError(null)).catch((error) => {
            setPreferenceError(t(error instanceof Error ? error.message : String(error)));
        });
    };

    const selectService = (index: number) => {
        void Promise.resolve().then(() => browserPreferences.setSelectedService(index)).then(() => setPreferenceError(null)).catch((error) => {
            setPreferenceError(t(error instanceof Error ? error.message : String(error)));
        });
    };

    return (
        <div className="welcome-workspace">
            <header className="welcome-workspace__header">
                <div className="welcome-workspace__brand">
                    <span className="welcome-workspace__brand-mark" aria-hidden="true"><UsbRoundedIcon /></span>
                    <span><strong>{t('MiniDisc Workspace')}</strong><small>{t('Local first · Open source')}</small></span>
                </div>
                <TopMenu onShowAbout={() => setAboutOpen(true)} onShowHelp={() => setHelpOpen(true)} onShowSettings={openSettings} />
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
                                <select value={selectedIndex} disabled={connecting} onChange={(event) => selectService(Number(event.target.value))}>
                                    {availableServices.map((service, index) => <option value={index} key={`${service.name}:${index}`}>{service.name}</option>)}
                                </select>
                            </label>
                            <div className="welcome-workspace__actions">
                                <button className="welcome-workspace__primary" disabled={connecting || selectedServiceUnavailable || !selectedService} onClick={requestConnection}><UsbRoundedIcon />{connecting ? t('Connecting…') : t('Connect device')}</button>
                                <button className="welcome-workspace__secondary" disabled={connecting} onClick={addCustomDevice}><AddRoundedIcon />{t('Add custom device')}</button>
                                {selectedServiceIsCustom ? <button className="welcome-workspace__danger" disabled={connecting} onClick={removeSelectedCustomDevice}><DeleteOutlineRoundedIcon />{t('Remove')}</button> : null}
                            </div>
                            {selectedServiceUnavailable ? <div className="welcome-workspace__notice">{t('The selected connection needs a Chromium browser with WebUSB.')}</div> : null}
                            {preferenceError ? <div className="welcome-workspace__error" role="alert"><strong>{t('Could not save this preference.')}</strong><span>{preferenceError}</span></div> : null}
                            {connectionFailed ? <div className="welcome-workspace__error" role="alert"><strong>{t('Connection failed')}</strong><span>{connection.message}</span></div> : null}
                            {!window.native?.interface && navigator.userAgent.includes('Vivaldi') ? <div className="welcome-workspace__notice"><strong>{t('Notice for users of the Vivaldi web browser')}</strong><span>{t("Vivaldi's implementation of WebUSB is broken.")} {t('Please switch to a different Chromium-based browser.')}</span></div> : null}
                            <button className="welcome-workspace__guide" onClick={() => setHelpOpen(true)}>{t('First time here? Read the guide')}<LaunchRoundedIcon /></button>
                        </>
                    ) : (
                        <>
                            <img className="welcome-workspace__browser-icon" alt={t('Chrome logo')} src={ChromeIconPath} />
                            <span className="welcome-workspace__eyebrow">{t('BROWSER REQUIREMENTS')}</span>
                            <h2 id="welcome-connect-title">{t('This browser cannot connect directly to USB MiniDisc devices.')}</h2>
                            <p>{t('Use a Chromium browser or a supported desktop build to connect a local MiniDisc device.')}</p>
                            <div className="welcome-workspace__actions">
                                <a className="welcome-workspace__primary" rel="noopener noreferrer" target="_blank" href="https://www.google.com/chrome/">Chrome<LaunchRoundedIcon /></a>
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
            <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            <OtherDeviceDialog
                open={customDeviceOpen}
                onClose={() => setCustomDeviceOpen(false)}
                onAdd={(info) => browserPreferences.addService(info)}
            />
            <AppDialog
                open={fullHimdReview !== null}
                size="small"
                title={t('Secure HiMD full access')}
                onClose={() => setFullHimdReview(null)}
                actions={
                    <>
                        <button onClick={() => setFullHimdReview(null)}>{t('Cancel')}</button>
                        <button
                            className="app-dialog__button--primary"
                            onClick={() => {
                                const reviewed = fullHimdReview;
                                setFullHimdReview(null);
                                if (reviewed) void connectToService(reviewed.service, reviewed.index);
                            }}
                        >
                            {t('Continue with browser access')}
                        </button>
                    </>
                }
            >
                <p>{t('Browser HiMD full-access mode is experimental. ElectronWMD is recommended for this workflow.')}</p>
                <p>{t('Continue only if you understand that this mode requests advanced access to the connected HiMD device.')}</p>
            </AppDialog>
        </div>
    );
};

export default Welcome;
